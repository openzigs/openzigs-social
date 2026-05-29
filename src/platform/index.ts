/**
 * Platform service public surface (#127).
 *
 * The platform service is the connector-agnostic backbone that every social
 * platform connector (Cohorts A/B/C) plugs into. It owns:
 *
 *   - **SocialBrain persistence** (#143) — cross-platform contacts/threads/messages.
 *   - **OAuth callback handling** (#139) — CSRF-safe code→token exchange + vault storage.
 *   - **Webhook receiving** (#140) — HMAC-verified, de-duplicated inbound events.
 *   - **Rate limiting** (#141) — per-platform token buckets + quotas with warnings.
 *   - **Retry / DLQ** (#142) — exponential backoff with a dead-letter queue.
 *   - **DM dispatch** (#144) — inbound rule chain + outbound sender registry
 *     that satisfies the #51 {@link SocialDmSender} port.
 *
 * Connectors interact with the platform service exclusively through the ports
 * and registries re-exported here.
 */

// SocialBrain persistence (#143)
export {
  SocialBrainRepository,
  type SocialContact,
  type UpsertContactInput,
  type SocialThread,
  type UpsertThreadInput,
  type SocialMessage,
  type UpsertMessageInput,
  type MessageDirection
} from "./social-brain/repository.js";

// OAuth (#139)
export {
  OAuthStateStore,
  DEFAULT_STATE_TTL_MS,
  type StateRecord,
  type OAuthStateStoreOptions
} from "./oauth/state-store.js";
export {
  ConnectorRegistry,
  type OAuthTokenExchanger,
  type ExchangedToken,
  type ExchangeContext
} from "./oauth/connector-registry.js";
export {
  createOAuthRouter,
  type OAuthRouterDeps,
  type OAuthVault,
  type OAuthLogger
} from "./oauth/router.js";

// Webhooks (#140)
export {
  verifySignature,
  computeSignature,
  normalizeSignature,
  type HmacAlgorithm
} from "./webhooks/hmac.js";
export { WebhookEventStore } from "./webhooks/event-store.js";
export {
  WebhookHandlerRegistry,
  type WebhookHandler,
  type WebhookEvent
} from "./webhooks/handler-registry.js";
export {
  createWebhookRouter,
  type WebhookRouterDeps,
  type WebhookLogger
} from "./webhooks/router.js";

// Rate limiting (#141)
export { TokenBucket, type TokenBucketOptions } from "./rate-limit/token-bucket.js";
export {
  RateLimitBroker,
  DEFAULT_WARN_THRESHOLD,
  type PlatformBudget,
  type RateLimitBrokerOptions,
  type AcquireResult,
  type RateLimitWarning,
  type EmitFn as RateLimitEmitFn
} from "./rate-limit/broker.js";

// Retry / DLQ (#142)
export {
  computeBackoffMs,
  retry,
  dispatchWithDlq,
  RetryExhaustedError,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MULTIPLIER,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_JITTER_RATIO,
  type BackoffParams,
  type RetryOptions,
  type DispatchOp,
  type DispatchOutcome
} from "./retry/backoff.js";
export { DlqRepository, type DlqEntry, type DlqInput } from "./retry/dlq.js";

// DM dispatch (#144)
export {
  DmDispatcher,
  humanOwnedGuard,
  approvalGatedReply,
  type DmRule,
  type DmContext,
  type InboundDm,
  type DispatchResult,
  type DmDispatcherDeps,
  type EmitFn as DmEmitFn
} from "./dm/dispatcher.js";
export { SocialDmSenderRegistry } from "./dm/sender-registry.js";
