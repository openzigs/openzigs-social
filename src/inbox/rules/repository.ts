/**
 * Rule + firing persistence and application (#74).
 *
 * {@link RuleRepository} owns CRUD over `inbox_rules`, the append-only
 * `inbox_rule_firings` audit trail, and the derived `inbox_thread_state` a
 * matched rule updates (priority / flag). All SQL is parameterized prepared
 * statements; condition/action structs are stored as JSON and validated on the
 * way in so only well-formed, declarative rules ever persist.
 */
import type { Database, Statement } from "better-sqlite3";

import type {
  Condition,
  ComparisonOperator,
  Priority,
  RuleActions,
  RuleDefinition,
  RuleEvaluation,
  RuleInput
} from "./types.js";
import { PRIORITIES } from "./types.js";
import { buildFacts, evaluateRules, type FactSources } from "./engine.js";

const COMPARISON_OPS: ReadonlySet<ComparisonOperator> = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "startsWith",
  "in",
  "exists"
]);

const MAX_CONDITION_DEPTH = 12;

/** Thrown when a rule's condition/action struct is malformed. */
export class InvalidRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRuleError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a declarative condition tree. Rejects anything that is not one of
 * the four known shapes — there is no escape hatch to arbitrary code, and a
 * forged `op` or extra keys are refused rather than silently ignored.
 */
export function validateCondition(value: unknown, depth = 0): asserts value is Condition {
  if (depth > MAX_CONDITION_DEPTH) {
    throw new InvalidRuleError("condition nested too deeply");
  }
  if (!isPlainObject(value)) {
    throw new InvalidRuleError("condition must be an object");
  }
  if ("all" in value || "any" in value) {
    const key = "all" in value ? "all" : "any";
    const branch = value[key];
    if (!Array.isArray(branch)) {
      throw new InvalidRuleError(`'${key}' must be an array`);
    }
    for (const child of branch) validateCondition(child, depth + 1);
    return;
  }
  if ("not" in value) {
    validateCondition(value.not, depth + 1);
    return;
  }
  // Leaf comparison.
  const field = value.field;
  const op = value.op;
  if (typeof field !== "string" || field.length === 0) {
    throw new InvalidRuleError("comparison requires a non-empty 'field'");
  }
  if (typeof op !== "string" || !COMPARISON_OPS.has(op as ComparisonOperator)) {
    throw new InvalidRuleError(`unknown comparison operator: ${String(op)}`);
  }
  if (op !== "exists") {
    const val = value.value;
    const ok =
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean" ||
      (Array.isArray(val) && val.every((x) => typeof x === "string" || typeof x === "number"));
    if (!ok) {
      throw new InvalidRuleError(`operator '${op}' requires a primitive or array 'value'`);
    }
  }
}

/** Validate the action bag. */
export function validateActions(value: unknown): asserts value is RuleActions {
  if (!isPlainObject(value)) {
    throw new InvalidRuleError("actions must be an object");
  }
  if (value.priority !== undefined && !PRIORITIES.includes(value.priority as Priority)) {
    throw new InvalidRuleError(`invalid priority: ${String(value.priority)}`);
  }
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || !value.tags.every((t) => typeof t === "string")) {
      throw new InvalidRuleError("tags must be an array of strings");
    }
  }
  if (value.route !== undefined && typeof value.route !== "string") {
    throw new InvalidRuleError("route must be a string");
  }
  if (value.flag !== undefined && typeof value.flag !== "boolean") {
    throw new InvalidRuleError("flag must be a boolean");
  }
}

interface RuleRow {
  id: number;
  name: string;
  enabled: number;
  sort_order: number;
  condition_json: string;
  actions_json: string;
  created_at: string;
  updated_at: string;
}

interface FiringRow {
  id: number;
  rule_id: number;
  platform: string;
  platform_message_id: string;
  message_id: number | null;
  actions_json: string;
  fired_at: string;
}

/** One persisted audit row for a rule that matched a message. */
export interface RuleFiring {
  id: number;
  ruleId: number;
  platform: string;
  platformMessageId: string;
  messageId?: number;
  actions: RuleActions;
  firedAt: string;
}

function toRule(row: RuleRow): RuleDefinition {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled !== 0,
    sortOrder: row.sort_order,
    condition: JSON.parse(row.condition_json) as Condition,
    actions: JSON.parse(row.actions_json) as RuleActions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toFiring(row: FiringRow): RuleFiring {
  return {
    id: row.id,
    ruleId: row.rule_id,
    platform: row.platform,
    platformMessageId: row.platform_message_id,
    messageId: row.message_id ?? undefined,
    actions: JSON.parse(row.actions_json) as RuleActions,
    firedAt: row.fired_at
  };
}

export class RuleRepository {
  private readonly db: Database;
  private readonly stmts: {
    insert: Statement;
    update: Statement;
    get: Statement;
    delete: Statement;
    listEnabled: Statement;
    listAll: Statement;
    insertFiring: Statement;
    listFiringsByRule: Statement;
    listFiringsByMessage: Statement;
    upsertThreadState: Statement;
  };

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      insert: db.prepare(
        `INSERT INTO inbox_rules (name, enabled, sort_order, condition_json, actions_json)
         VALUES (@name, @enabled, @sortOrder, @condition, @actions)`
      ),
      update: db.prepare(
        `UPDATE inbox_rules SET
           name = @name, enabled = @enabled, sort_order = @sortOrder,
           condition_json = @condition, actions_json = @actions,
           updated_at = datetime('now')
         WHERE id = @id`
      ),
      get: db.prepare(`SELECT * FROM inbox_rules WHERE id = ?`),
      delete: db.prepare(`DELETE FROM inbox_rules WHERE id = ?`),
      listEnabled: db.prepare(
        `SELECT * FROM inbox_rules WHERE enabled = 1 ORDER BY sort_order ASC, id ASC`
      ),
      listAll: db.prepare(`SELECT * FROM inbox_rules ORDER BY sort_order ASC, id ASC`),
      insertFiring: db.prepare(
        `INSERT INTO inbox_rule_firings
           (rule_id, platform, platform_message_id, message_id, actions_json)
         VALUES (@ruleId, @platform, @platformMessageId, @messageId, @actions)`
      ),
      listFiringsByRule: db.prepare(
        `SELECT * FROM inbox_rule_firings WHERE rule_id = ? ORDER BY fired_at DESC, id DESC LIMIT ? OFFSET ?`
      ),
      listFiringsByMessage: db.prepare(
        `SELECT * FROM inbox_rule_firings
         WHERE platform = ? AND platform_message_id = ?
         ORDER BY fired_at DESC, id DESC`
      ),
      upsertThreadState: db.prepare(
        `INSERT INTO inbox_thread_state (thread_id, priority, flagged, updated_at)
         VALUES (@threadId, @priority, @flagged, datetime('now'))
         ON CONFLICT (thread_id) DO UPDATE SET
           priority   = @priority,
           flagged    = MAX(inbox_thread_state.flagged, @flagged),
           updated_at = datetime('now')`
      )
    };
  }

  /** Create a rule after validating its declarative structs. */
  create(input: RuleInput): RuleDefinition {
    validateCondition(input.condition);
    validateActions(input.actions);
    const info = this.stmts.insert.run({
      name: input.name,
      enabled: input.enabled === false ? 0 : 1,
      sortOrder: input.sortOrder ?? 0,
      condition: JSON.stringify(input.condition),
      actions: JSON.stringify(input.actions)
    });
    const created = this.get(Number(info.lastInsertRowid));
    if (!created) throw new Error("rule insert did not persist");
    return created;
  }

  /** Update an existing rule. Returns undefined if it does not exist. */
  update(id: number, input: RuleInput): RuleDefinition | undefined {
    if (!this.get(id)) return undefined;
    validateCondition(input.condition);
    validateActions(input.actions);
    this.stmts.update.run({
      id,
      name: input.name,
      enabled: input.enabled === false ? 0 : 1,
      sortOrder: input.sortOrder ?? 0,
      condition: JSON.stringify(input.condition),
      actions: JSON.stringify(input.actions)
    });
    return this.get(id);
  }

  get(id: number): RuleDefinition | undefined {
    const row = this.stmts.get.get(id) as RuleRow | undefined;
    return row ? toRule(row) : undefined;
  }

  /** Delete a rule (and, via FK cascade, its firings). */
  delete(id: number): boolean {
    return this.stmts.delete.run(id).changes > 0;
  }

  list(includeDisabled = true): RuleDefinition[] {
    const stmt = includeDisabled ? this.stmts.listAll : this.stmts.listEnabled;
    return (stmt.all() as RuleRow[]).map(toRule);
  }

  listFirings(ruleId: number, limit = 100, offset = 0): RuleFiring[] {
    return (this.stmts.listFiringsByRule.all(ruleId, limit, offset) as FiringRow[]).map(toFiring);
  }

  listFiringsForMessage(platform: string, platformMessageId: string): RuleFiring[] {
    return (this.stmts.listFiringsByMessage.all(platform, platformMessageId) as FiringRow[]).map(
      toFiring
    );
  }

  /**
   * Evaluate all enabled rules against one message, persist a firing audit row
   * per matched rule, and apply the aggregated priority/flag to the thread
   * state. Returns the evaluation outcome. The firing persistence + thread-state
   * update run in a single transaction so the audit trail and derived state
   * never diverge.
   */
  applyToMessage(sources: FactSources): RuleEvaluation {
    const facts = buildFacts(sources);
    const rules = this.list(false);
    const evaluation = evaluateRules(rules, facts);
    const { message, thread } = sources;

    const persist = this.db.transaction(() => {
      for (const firing of evaluation.firings) {
        this.stmts.insertFiring.run({
          ruleId: firing.ruleId,
          platform: message.platform,
          platformMessageId: message.platformMessageId,
          messageId: message.id,
          actions: JSON.stringify(firing.actions)
        });
      }
      if (thread && (evaluation.priority !== undefined || evaluation.flagged)) {
        this.stmts.upsertThreadState.run({
          threadId: thread.id,
          priority: evaluation.priority ?? "normal",
          flagged: evaluation.flagged ? 1 : 0
        });
      }
    });
    persist();

    return evaluation;
  }
}
