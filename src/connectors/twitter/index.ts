/**
 * X (Twitter) Cohort C connector module — public surface + wiring entrypoint
 * (#66: #67 OAuth/transport, #68 publish/DM/analytics, #69 credit tracker,
 * #70 quota threshold warnings).
 *
 * Like the LinkedIn and Meta connectors, X is a *consumer* of the platform-
 * service backbone (#127) and owns zero rate-limit/retry/OAuth-callback
 * machinery of its own. It registers a single {@link OAuthTokenExchanger}
 * (PKCE), optionally a DM sender (paid, DM-enabled tier only), and returns the
 * wired client + dispatcher + publisher + pollers + credit/quota guard for the
 * server to schedule and surface in the model panel.
 *
 * ## Tier policy (epic #66)
 * The X v2 API gates write volume + DM behind a paid tier. The active tier
 * (`free`/`basic`/`pro`) fixes the monthly write cap (#69) and whether DM is
 * available at all — Free is **always** DM-disabled regardless of config
 * (`isDmEnabledForTier`, fail closed).
 */
import type { Database } from "better-sqlite3";

import type {
  ConnectorRegistry,
  DlqRepository,
  RateLimitBroker,
  SocialBrainRepository,
  SocialDmSenderRegistry
} from "../../platform/index.js";
import type { TwitterAppCredential } from "../../vault/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { TwitterAnalyticsPoller } from "./analytics-poller.js";
import { TwitterCreditTracker } from "./credit-tracker.js";
import { TwitterDispatcher } from "./dispatcher.js";
import { TwitterDmPoller, TwitterDmSender } from "./dm.js";
import {
  TWITTER_DEFAULT_SCOPES,
  TWITTER_DM_SCOPES,
  TwitterOAuthExchanger,
  type TwitterAppCredentials
} from "./oauth.js";
import { TwitterPublisher } from "./publisher.js";
import { TwitterQuotaGuard, type QuotaAlertSink, type QuotaEmit } from "./quota-guard.js";
import { TwitterRestClient, type FetchLike } from "./rest-client.js";
import { isDmEnabledForTier, tierWriteQuota, type TwitterTier } from "./tiers.js";

export {
  TwitterRestClient,
  TwitterApiError,
  isTransientTwitterError,
  TWITTER_API_BASE_URL
} from "./rest-client.js";
export { TwitterDispatcher } from "./dispatcher.js";
export {
  TwitterOAuthExchanger,
  TwitterAppNotConfiguredError,
  TwitterPkceMissingError,
  TWITTER_DEFAULT_SCOPES,
  TWITTER_DM_SCOPES,
  TWITTER_TOKEN_URL
} from "./oauth.js";
export { TwitterPublisher } from "./publisher.js";
export { TwitterDmSender, TwitterDmPoller, TwitterDmDisabledError } from "./dm.js";
export { TwitterAnalyticsPoller } from "./analytics-poller.js";
export { TwitterCreditTracker, utcMonth, type CreditSummary } from "./credit-tracker.js";
export {
  TwitterQuotaGuard,
  TwitterQuotaExceededError,
  type QuotaEvent,
  type QuotaLevel
} from "./quota-guard.js";
export {
  DEFAULT_TIER_WRITE_QUOTA,
  TIER_DM_PERMITTED,
  isDmEnabledForTier,
  tierWriteQuota,
  type TwitterTier
} from "./tiers.js";

/** Non-secret X connector configuration. */
export interface TwitterConnectorConfig {
  /** X v2 API base host incl. the `/2` version path. */
  apiBaseUrl: string;
  /** OAuth 2.0 token endpoint (override for testing). */
  tokenUrl?: string;
  /** Access tier governing write budget + DM availability. */
  tier: TwitterTier;
  /** User opt-in for DM (force-disabled on Free regardless). */
  dmEnabled: boolean;
  /** Per-tier monthly write-quota caps. */
  writeQuota?: Partial<Record<TwitterTier, number>>;
  /** Utilisation ratio in (0,1] at which to warn. */
  warnThreshold?: number;
  /** Public base URL the OAuth callback router is reachable at. */
  oauthCallbackBaseUrl: string;
}

/** Minimal vault surface the connector reads (no secrets returned/logged). */
export interface TwitterConnectorVault {
  getTwitter(): Promise<TwitterAppCredential | undefined>;
}

export interface RegisterTwitterConnectorsDeps {
  config: TwitterConnectorConfig;
  registries: { oauth: ConnectorRegistry; dmSenders: SocialDmSenderRegistry };
  vault: TwitterConnectorVault;
  /** Cross-platform SocialBrain store (#143) for inbound DMs. */
  brain: SocialBrainRepository;
  /** Shared rate-limit broker (#141), pre-seeded with the X budgets. */
  broker: RateLimitBroker;
  /** Dead-letter queue (#142). */
  dlq: DlqRepository;
  /** Shared analytics store (#96). */
  insights: InsightsRepository;
  /** Database handle for the write-quota credit ledger (#69). */
  db: Database;
  /** Resolves the connected account's access token for DM/analytics polling. */
  getAccount?: () => Promise<{ accessToken: string } | undefined>;
  /** Socket emitter for `twitter:quota` model-panel updates (#70). */
  emit?: QuotaEmit;
  /** Telegram alert sink for threshold/exhaustion notices (#70). */
  alert?: QuotaAlertSink;
  /** Injected transport for tests. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
}

/** What registration produced, for the server to build schedulers/pollers. */
export interface TwitterConnectors {
  client: TwitterRestClient;
  dispatcher: TwitterDispatcher;
  publisher: TwitterPublisher;
  dmSender: TwitterDmSender;
  dmPoller: TwitterDmPoller;
  analyticsPoller: TwitterAnalyticsPoller;
  creditTracker: TwitterCreditTracker;
  quotaGuard: TwitterQuotaGuard;
  /** Effective DM-enabled decision after the tier gate. */
  dmEnabled: boolean;
}

function callbackUrl(base: string, platform: string): string {
  return `${base.replace(/\/$/, "")}/oauth/callback/${platform}`;
}

/**
 * Register the X adapter into the platform-service registries and return the
 * wired client/dispatcher/publisher/pollers + credit/quota guard. The OAuth
 * exchanger is always registered (it resolves app creds lazily and fails closed
 * when unset). The DM sender is registered ONLY when the tier permits DM and
 * the user opted in.
 */
export async function registerTwitterConnectors(
  deps: RegisterTwitterConnectorsDeps
): Promise<TwitterConnectors> {
  const { config, registries, vault, brain, broker, dlq, insights, db, fetchImpl } = deps;

  const dmEnabled = isDmEnabledForTier(config.tier, config.dmEnabled);
  const cap = tierWriteQuota(config.tier, config.writeQuota);

  const getAppCredentials = async (): Promise<TwitterAppCredentials | undefined> => {
    const cred = await vault.getTwitter();
    return cred
      ? {
          clientId: cred.clientId,
          ...(cred.clientSecret ? { clientSecret: cred.clientSecret } : {})
        }
      : undefined;
  };

  const scopes = dmEnabled
    ? [...TWITTER_DEFAULT_SCOPES, ...TWITTER_DM_SCOPES]
    : [...TWITTER_DEFAULT_SCOPES];

  registries.oauth.register(
    new TwitterOAuthExchanger({
      redirectUri: callbackUrl(config.oauthCallbackBaseUrl, "twitter"),
      getAppCredentials,
      scopes,
      ...(config.tokenUrl ? { tokenUrl: config.tokenUrl } : {}),
      ...(fetchImpl ? { fetchImpl } : {})
    })
  );

  const client = new TwitterRestClient({
    baseUrl: config.apiBaseUrl,
    ...(fetchImpl ? { fetchImpl } : {})
  });
  const dispatcher = new TwitterDispatcher({ broker, dlq });

  const creditTracker = new TwitterCreditTracker({ db });
  const quotaGuard = new TwitterQuotaGuard({
    tracker: creditTracker,
    cap,
    ...(config.warnThreshold !== undefined ? { warnThreshold: config.warnThreshold } : {}),
    ...(deps.emit ? { emit: deps.emit } : {}),
    ...(deps.alert ? { alert: deps.alert } : {})
  });

  const publisher = new TwitterPublisher({ client, dispatcher, quota: quotaGuard });

  const getAccount = deps.getAccount ?? (async () => undefined);
  const dmSender = new TwitterDmSender({
    client,
    dispatcher,
    enabled: dmEnabled,
    getAccount,
    quota: quotaGuard
  });
  const dmPoller = new TwitterDmPoller({ client, brain, dispatcher, enabled: dmEnabled });
  const analyticsPoller = new TwitterAnalyticsPoller({ client, insights, dispatcher });

  // Only expose the DM sender to the relay when the tier actually permits DM.
  if (dmEnabled) {
    registries.dmSenders.register("twitter", dmSender);
  }

  return {
    client,
    dispatcher,
    publisher,
    dmSender,
    dmPoller,
    analyticsPoller,
    creditTracker,
    quotaGuard,
    dmEnabled
  };
}

export { InsightsRepository };
