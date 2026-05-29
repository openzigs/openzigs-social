/**
 * LinkedIn (Cohort B) connector module — public surface + wiring entrypoint
 * (#61 publish/comments, #62 analytics).
 *
 * Like the Meta connector, LinkedIn is a *consumer* of the platform-service
 * backbone (#127) and owns zero rate-limit/retry/OAuth-callback machinery of
 * its own. It registers a single {@link OAuthTokenExchanger} (comment + post
 * scopes only — see {@link assertNoDmScopes}) and returns the shared REST
 * client + dispatcher + pollers for the server to schedule.
 *
 * ## v1 limitation — no direct messages
 * LinkedIn DM requires the gated Compliance Partner Program and is intentionally
 * NOT implemented: no DM sender is registered and the OAuth exchanger refuses
 * any messaging scope at construction.
 */
import type {
  ConnectorRegistry,
  DlqRepository,
  RateLimitBroker,
  SocialBrainRepository
} from "../../platform/index.js";
import type { LinkedInAppCredential } from "../../vault/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { LinkedInAnalyticsPoller } from "./analytics-poller.js";
import { LinkedInCommentPoller } from "./comment-poller.js";
import { LinkedInDispatcher } from "./dispatcher.js";
import { LinkedInOAuthExchanger, type LinkedInAppCredentials } from "./oauth.js";
import { LinkedInPublisher } from "./publisher.js";
import { LinkedInRestClient, type FetchLike } from "./rest-client.js";

export {
  LinkedInRestClient,
  LinkedInApiError,
  isTransientLinkedInError,
  LINKEDIN_API_VERSION,
  LINKEDIN_REST_BASE_URL
} from "./rest-client.js";
export { LinkedInDispatcher } from "./dispatcher.js";
export {
  LinkedInOAuthExchanger,
  LinkedInDmScopeError,
  assertNoDmScopes,
  LINKEDIN_DEFAULT_SCOPES,
  LINKEDIN_FORBIDDEN_DM_SCOPES,
  LINKEDIN_TOKEN_URL
} from "./oauth.js";
export { LinkedInPublisher, authorUrn, type LinkedInAuthor } from "./publisher.js";
export { LinkedInCommentPoller } from "./comment-poller.js";
export { LinkedInAnalyticsPoller } from "./analytics-poller.js";

/** Non-secret LinkedIn connector configuration. */
export interface LinkedInConnectorConfig {
  /** Versioned REST base host incl. no version path. */
  restBaseUrl: string;
  /** Versioned API header value (`yyyymm`). */
  apiVersion?: string;
  /** Public base URL the OAuth callback router is reachable at. */
  oauthCallbackBaseUrl: string;
}

/** Minimal vault surface the connector reads (no secrets returned/logged). */
export interface LinkedInConnectorVault {
  getLinkedIn(): Promise<LinkedInAppCredential | undefined>;
}

export interface RegisterLinkedInConnectorsDeps {
  config: LinkedInConnectorConfig;
  registries: { oauth: ConnectorRegistry };
  vault: LinkedInConnectorVault;
  /** Cross-platform SocialBrain store (#143) for inbound comments. */
  brain: SocialBrainRepository;
  /** Shared rate-limit broker (#141), pre-seeded with the `"linkedin"` budget. */
  broker: RateLimitBroker;
  /** Dead-letter queue (#142). */
  dlq: DlqRepository;
  /** Shared analytics store (#96); created when omitted only if a db is given. */
  insights: InsightsRepository;
  /** Injected transport for tests. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
}

/** What registration produced, for the server to build schedulers/pollers. */
export interface LinkedInConnectors {
  client: LinkedInRestClient;
  dispatcher: LinkedInDispatcher;
  publisher: LinkedInPublisher;
  commentPoller: LinkedInCommentPoller;
  analyticsPoller: LinkedInAnalyticsPoller;
}

function callbackUrl(base: string, platform: string): string {
  return `${base.replace(/\/$/, "")}/oauth/callback/${platform}`;
}

/**
 * Register the LinkedIn adapter into the platform-service registries and return
 * the wired client/dispatcher/pollers. The OAuth exchanger is always registered
 * (it resolves app creds lazily and fails closed when unset). No DM sender is
 * registered — LinkedIn DM is out of scope for v1.
 */
export async function registerLinkedInConnectors(
  deps: RegisterLinkedInConnectorsDeps
): Promise<LinkedInConnectors> {
  const { config, registries, vault, brain, broker, dlq, insights, fetchImpl } = deps;

  const getAppCredentials = async (): Promise<LinkedInAppCredentials | undefined> => {
    const cred = await vault.getLinkedIn();
    return cred ? { clientId: cred.clientId, clientSecret: cred.clientSecret } : undefined;
  };

  registries.oauth.register(
    new LinkedInOAuthExchanger({
      redirectUri: callbackUrl(config.oauthCallbackBaseUrl, "linkedin"),
      getAppCredentials,
      fetchImpl
    })
  );

  const client = new LinkedInRestClient({
    baseUrl: config.restBaseUrl,
    ...(config.apiVersion ? { apiVersion: config.apiVersion } : {}),
    fetchImpl
  });
  const dispatcher = new LinkedInDispatcher({ broker, dlq });
  const publisher = new LinkedInPublisher({ client, dispatcher });
  const commentPoller = new LinkedInCommentPoller({ client, brain, dispatcher });
  const analyticsPoller = new LinkedInAnalyticsPoller({ client, insights, dispatcher });

  return { client, dispatcher, publisher, commentPoller, analyticsPoller };
}

export { InsightsRepository };
