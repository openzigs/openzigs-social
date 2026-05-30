/**
 * Declarative rule engine — evaluator (#74).
 *
 * Pure, deterministic interpretation of {@link Condition} trees over a flat
 * {@link Facts} snapshot. SECURITY: this module contains the ENTIRE matching
 * surface and it is a fixed `switch` over a typed operator enum. There is no
 * `eval`, no `new Function`, no property access by attacker-controlled code —
 * field lookups are own-property-guarded reads on a pre-built facts map (a
 * forged `__proto__`/`constructor` field reads undefined, never the prototype
 * chain). A malicious rule can never escalate beyond "tag/route/flag this
 * message".
 */
import type {
  ComparisonCondition,
  Condition,
  Facts,
  Priority,
  RuleDefinition,
  RuleEvaluation
} from "./types.js";
import { priorityRank } from "./types.js";

import type {
  SocialContact,
  SocialMessage,
  SocialThread
} from "../../platform/social-brain/repository.js";

function isAll(c: Condition): c is { all: Condition[] } {
  return Object.prototype.hasOwnProperty.call(c, "all");
}
function isAny(c: Condition): c is { any: Condition[] } {
  return Object.prototype.hasOwnProperty.call(c, "any");
}
function isNot(c: Condition): c is { not: Condition } {
  return Object.prototype.hasOwnProperty.call(c, "not");
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

/** Evaluate one comparison leaf against the facts. */
function evaluateComparison(cond: ComparisonCondition, facts: Facts): boolean {
  // Prototype-safe lookup: a forged field like "__proto__" / "constructor" /
  // "prototype" must read undefined, never walk the prototype chain. Only own
  // enumerable keys count as facts.
  const actual = Object.hasOwn(facts, cond.field) ? facts[cond.field] : undefined;
  const expected = cond.value;

  switch (cond.op) {
    case "exists":
      return actual !== undefined;
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asNumber(actual);
      const b = asNumber(expected);
      if (a === undefined || b === undefined) return false;
      if (cond.op === "gt") return a > b;
      if (cond.op === "gte") return a >= b;
      if (cond.op === "lt") return a < b;
      return a <= b;
    }
    case "contains": {
      const hay = asString(actual);
      const needle = asString(expected);
      if (hay === undefined || needle === undefined) return false;
      return hay.toLowerCase().includes(needle.toLowerCase());
    }
    case "startsWith": {
      const hay = asString(actual);
      const needle = asString(expected);
      if (hay === undefined || needle === undefined) return false;
      return hay.toLowerCase().startsWith(needle.toLowerCase());
    }
    case "in": {
      if (!Array.isArray(expected)) return false;
      return (expected as Array<string | number>).some((item) => item === actual);
    }
    default: {
      // Exhaustiveness guard: an unknown operator never matches (and never runs
      // anything). This keeps a forged rule with a bogus `op` inert.
      return false;
    }
  }
}

/** Evaluate a full condition tree. Empty `all` ⇒ true; empty `any` ⇒ false. */
export function evaluateCondition(condition: Condition, facts: Facts): boolean {
  if (isAll(condition)) {
    return condition.all.every((c) => evaluateCondition(c, facts));
  }
  if (isAny(condition)) {
    return condition.any.some((c) => evaluateCondition(c, facts));
  }
  if (isNot(condition)) {
    return !evaluateCondition(condition.not, facts);
  }
  return evaluateComparison(condition, facts);
}

/** Inputs for {@link buildFacts}. */
export interface FactSources {
  message: SocialMessage;
  contact?: SocialContact;
  thread?: SocialThread;
}

function readMetaNumber(
  meta: Record<string, unknown> | undefined,
  key: string
): number | undefined {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : asNumber(v);
}

function readMetaString(
  meta: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const v = meta?.[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Build a flat fact snapshot from a SocialBrain message + its contact/thread.
 *
 * `kind` is read from message metadata (`"dm"` | `"comment"`), defaulting to
 * `"dm"`. `author.followerCount` is read from contact metadata so rules like
 * "route high-follower authors to priority" work against the data the
 * connectors already persist.
 */
export function buildFacts(sources: FactSources): Facts {
  const { message, contact, thread } = sources;
  const kind = readMetaString(message.metadata, "kind") ?? "dm";
  const facts: Facts = {
    platform: message.platform,
    direction: message.direction,
    kind,
    "message.body": message.body,
    "message.platform": message.platform,
    "message.kind": kind,
    "message.direction": message.direction
  };
  if (contact) {
    facts["author.handle"] = contact.handle;
    facts["author.displayName"] = contact.displayName;
    const followers = readMetaNumber(contact.metadata, "followerCount");
    if (followers !== undefined) facts["author.followerCount"] = followers;
    const verified = contact.metadata?.["verified"];
    if (typeof verified === "boolean") facts["author.verified"] = verified;
  }
  if (thread) {
    facts["thread.platform"] = thread.platform;
    if (thread.subject !== undefined) facts["thread.subject"] = thread.subject;
  }
  // Strip undefined keys so `exists` behaves intuitively.
  for (const key of Object.keys(facts)) {
    if (facts[key] === undefined) delete facts[key];
  }
  return facts;
}

function higherPriority(a: Priority | undefined, b: Priority): Priority {
  if (a === undefined) return b;
  return priorityRank(b) > priorityRank(a) ? b : a;
}

/**
 * Evaluate an ordered set of enabled rules against one message's facts and
 * aggregate their actions. Disabled rules are skipped. The result records each
 * firing so the caller can persist the audit trail.
 */
export function evaluateRules(rules: RuleDefinition[], facts: Facts): RuleEvaluation {
  const result: RuleEvaluation = {
    firedRuleIds: [],
    tags: [],
    flagged: false,
    firings: []
  };
  const tagSet = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!evaluateCondition(rule.condition, facts)) continue;

    result.firedRuleIds.push(rule.id);
    result.firings.push({ ruleId: rule.id, actions: rule.actions });

    if (rule.actions.priority) {
      result.priority = higherPriority(result.priority, rule.actions.priority);
    }
    for (const tag of rule.actions.tags ?? []) tagSet.add(tag);
    if (rule.actions.route) result.route = rule.actions.route;
    if (rule.actions.flag) result.flagged = true;
  }

  result.tags = [...tagSet];
  return result;
}
