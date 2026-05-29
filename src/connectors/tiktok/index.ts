/**
 * TikTok (Cohort B) connector module — public surface + wiring entrypoint
 * (#64 publish/display + #65 PRIVATE-only constraint).
 *
 * Like the other connectors, TikTok consumes the platform-service backbone
 * (#127) and owns zero rate-limit/retry/OAuth-callback machinery of its own. It
 * registers a single {@link OAuthTokenExchanger} and returns the shared REST
 * client + dispatcher + publisher + display poller.
 *
 * ## v1 limitation — PRIVATE-only publishing
 * Until the app passes TikTok's content-posting audit, the publisher forces
 * `privacy_level: SELF_ONLY` and rejects any public visibility (see #65 +
 * {@link assertPrivateOnly}). The setup wizard surfaces this constraint to the
 * user before they connect.
 */
import type { ConnectorRegistry, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import type { TikTokAppCredential } from "../../vault/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { TikTokDispatcher } from "./dispatcher.js";
import { TikTokDisplayPoller } from "./display-poller.js";
import { TikTokOAuthExchanger, type TikTokAppCredentials } from "./oauth.js";
import { TikTokPublisher } from "./publisher.js";
import { TikTokRestClient, type FetchLike } from "./rest-client.js";

export {
  TikTokRestClient,
  TikTokApiError,
  isTransientTikTokError,
  TIKTOK_API_BASE_URL
} from "./rest-client.js";
export { TikTokDispatcher } from "./dispatcher.js";
export { TikTokOAuthExchanger, TIKTOK_DEFAULT_SCOPES, TIKTOK_TOKEN_URL } from "./oauth.js";
export {
  TikTokPublisher,
  assertPrivateOnly,
  TikTokPrivacyError,
  TIKTOK_PRIVATE_PRIVACY_LEVEL,
  TIKTOK_FORBIDDEN_PRIVACY_LEVELS
} from "./publisher.js";
export { TikTokDisplayPoller, TIKTOK_USER_FIELDS, TIKTOK_VIDEO_FIELDS } from "./display-poller.js";

/** Non-secret TikTok connector configuration. */
export interface TikTokConnectorConfig {
  /** Open API v2 base host incl. the `/v2` segment. */
  apiBaseUrl: string;
  /** Public base URL the OAuth callback router is reachable at. */
  oauthCallbackBaseUrl: string;
}

/** Minimal vault surface the connector reads (no secrets returned/logged). */
export interface TikTokConnectorVault {
  getTikTok(): Promise<TikTokAppCredential | undefined>;
}

export interface RegisterTikTokConnectorsDeps {
  config: TikTokConnectorConfig;
  registries: { oauth: ConnectorRegistry };
  vault: TikTokConnectorVault;
  broker: RateLimitBroker;
  dlq: DlqRepository;
  insights: InsightsRepository;
  fetchImpl?: FetchLike;
}

export interface TikTokConnectors {
  client: TikTokRestClient;
  dispatcher: TikTokDispatcher;
  publisher: TikTokPublisher;
  displayPoller: TikTokDisplayPoller;
}

function callbackUrl(base: string, platform: string): string {
  return `${base.replace(/\/$/, "")}/oauth/callback/${platform}`;
}

export async function registerTikTokConnectors(
  deps: RegisterTikTokConnectorsDeps
): Promise<TikTokConnectors> {
  const { config, registries, vault, broker, dlq, insights, fetchImpl } = deps;

  const getAppCredentials = async (): Promise<TikTokAppCredentials | undefined> => {
    const cred = await vault.getTikTok();
    return cred ? { clientKey: cred.clientKey, clientSecret: cred.clientSecret } : undefined;
  };

  registries.oauth.register(
    new TikTokOAuthExchanger({
      redirectUri: callbackUrl(config.oauthCallbackBaseUrl, "tiktok"),
      getAppCredentials,
      fetchImpl
    })
  );

  const client = new TikTokRestClient({ baseUrl: config.apiBaseUrl, fetchImpl });
  const dispatcher = new TikTokDispatcher({ broker, dlq });
  const publisher = new TikTokPublisher({ client, dispatcher });
  const displayPoller = new TikTokDisplayPoller({ client, insights, dispatcher });

  return { client, dispatcher, publisher, displayPoller };
}

export { InsightsRepository };
