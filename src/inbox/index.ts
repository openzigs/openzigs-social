/**
 * Unified inbox module public surface (epic #71).
 *
 * Owns the inbox READ/aggregation layer (#74/#76/#77) and the declarative
 * comment rule engine (#74). It consumes the platform-service (#127) — the
 * SocialBrain repository (#143) for the underlying data and the DM dispatcher /
 * sender registry (#144) for the reply send path — and never re-implements
 * either.
 */
export {
  InboxRepository,
  buildMatchExpression,
  type InboxThreadSummary,
  type InboxThreadDetail,
  type InboxMessage,
  type ListThreadsOptions
} from "./repository.js";

export {
  PLATFORM_LIMITS,
  DEFAULT_LIMITS,
  limitsFor,
  isDmSupported,
  validateReply,
  type PlatformInboxLimits,
  type ReplyKind,
  type ReplyValidation
} from "./platform-limits.js";

export { evaluateCondition, evaluateRules, buildFacts, type FactSources } from "./rules/engine.js";

export {
  RuleRepository,
  InvalidRuleError,
  validateCondition,
  validateActions,
  type RuleFiring
} from "./rules/repository.js";

export {
  PRIORITIES,
  priorityRank,
  type Condition,
  type ComparisonCondition,
  type ComparisonOperator,
  type ConditionValue,
  type RuleActions,
  type RuleDefinition,
  type RuleInput,
  type RuleEvaluation,
  type Priority,
  type Facts
} from "./rules/types.js";
