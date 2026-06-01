/**
 * Light CRM module (epic #90) — public surface.
 *
 * Re-exports the deterministic lead scorer, the email-discovery helpers, and
 * the SQLite repository so the server (`src/server/crm/router.ts`) and tests can
 * import from a single entry point.
 */
export {
  scoreLead,
  scoreSentiment,
  bucketFor,
  DEFAULT_LEAD_SCORE_WEIGHTS,
  type LeadScore,
  type LeadBucket,
  type LeadScoreInput,
  type LeadScoreWeights
} from "./lead-score.js";

export {
  normalizeEmail,
  extractEmails,
  discoverEmail,
  discoverFollowerCount,
  collectStrings
} from "./email.js";

export {
  CrmRepository,
  MergeError,
  type CrmContact,
  type LinkedAccount,
  type TimelineMessage,
  type ScoredContact,
  type ContactDetail,
  type SuggestedMerge,
  type MergeRecord,
  type ListContactsOptions
} from "./repository.js";
