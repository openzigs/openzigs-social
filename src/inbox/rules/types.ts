/**
 * Declarative comment/message rule engine — type model (#74).
 *
 * Rules are **data, not code**. A rule's matching logic is a JSON-serializable
 * {@link Condition} tree and its effect is a {@link RuleActions} bag. The engine
 * ({@link ./engine.ts}) interprets these structs with a fixed, typed set of
 * operators — there is no `eval`, no `Function`, no dynamic code execution of
 * any kind. A hostile rule definition can at worst tag a message; it can never
 * run arbitrary JavaScript.
 *
 * Facts are a flat, string-keyed snapshot built from a SocialBrain message +
 * its contact + thread (see {@link ./engine.ts#buildFacts}). Conditions
 * reference facts by dotted field path (e.g. `author.followerCount`).
 */

/** Comparison operators supported by the engine. All total + side-effect-free. */
export type ComparisonOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in"
  | "exists";

/** A primitive a condition may compare against. */
export type ConditionValue = string | number | boolean | Array<string | number>;

/** Leaf condition: compare a single fact field with an operator. */
export interface ComparisonCondition {
  field: string;
  op: ComparisonOperator;
  /** Omitted only for the `exists` operator. */
  value?: ConditionValue;
}

/** All sub-conditions must hold (logical AND). */
export interface AllCondition {
  all: Condition[];
}

/** At least one sub-condition must hold (logical OR). */
export interface AnyCondition {
  any: Condition[];
}

/** Negation of a sub-condition. */
export interface NotCondition {
  not: Condition;
}

/** A declarative condition tree. */
export type Condition = ComparisonCondition | AllCondition | AnyCondition | NotCondition;

/** Priority levels the engine can assign, ordered low→urgent. */
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Numeric rank for a priority (higher = more urgent), for sorting/merging. */
export function priorityRank(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

/** The effect a rule applies when its condition matches. */
export interface RuleActions {
  /** Set the thread priority (highest across firing rules wins). */
  priority?: Priority;
  /** Tags to attach (unioned across firing rules). */
  tags?: string[];
  /** Logical destination, e.g. `"priority"`, `"spam"`, `"support"`. */
  route?: string;
  /** Auto-flag the thread for human attention. */
  flag?: boolean;
}

/** A persisted rule definition. */
export interface RuleDefinition {
  id: number;
  name: string;
  enabled: boolean;
  sortOrder: number;
  condition: Condition;
  actions: RuleActions;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when creating/updating a rule. */
export interface RuleInput {
  name: string;
  enabled?: boolean;
  sortOrder?: number;
  condition: Condition;
  actions: RuleActions;
}

/** Flat fact snapshot a condition is evaluated against. */
export type Facts = Record<string, string | number | boolean | undefined>;

/** Aggregate outcome of evaluating an ordered rule set against one message. */
export interface RuleEvaluation {
  /** Ids of rules that matched, in evaluation order. */
  firedRuleIds: number[];
  /** Highest priority assigned by any matched rule, if any. */
  priority?: Priority;
  /** Union of tags from all matched rules. */
  tags: string[];
  /** Last non-empty route assigned by a matched rule, if any. */
  route?: string;
  /** True if any matched rule set `flag`. */
  flagged: boolean;
  /** Per-rule applied actions, for audit persistence. */
  firings: Array<{ ruleId: number; actions: RuleActions }>;
}
