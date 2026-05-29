/**
 * Pinterest (Cohort B) connector module — public surface + wiring entrypoint
 * (#63 boards/pins + analytics).
 *
 * Like the Meta/LinkedIn connectors, Pinterest is a *consumer* of the
 * platform-service backbone (#127) and owns zero rate-limit/retry/OAuth-callback
 * machinery of its own. It registers a single {@link OAuthTokenExchanger} and
 * returns the shared REST client + dispatcher + publisher + analytics poller.
 */
import type { ConnectorRegistry, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import type { PinterestAppCredential } from "../../vault/index.js";
import { InsightsRepository } from "../meta/insights/repository.js";
import { PinterestAnalyticsPoller } from "./analytics-poller.js";
import { PinterestDispatcher } from "./dispatcher.js";
import { PinterestOAuthExchanger, type PinterestAppCredentials } from "./oauth.js";
import { PinterestPublisher } from "./publisher.js";
import { PinterestRestClient, type FetchLike } from "./rest-client.js";

export {
  PinterestRestClient,
  PinterestApiError,
  isTransientPinterestError,
  PINTEREST_API_BASE_URL
} from "./rest-client.js";
export { PinterestDispatcher } from "./dispatcher.js";
export { PinterestOAuthExchanger, PINTEREST_DEFAULT_SCOPES, PINTEREST_TOKEN_URL } from "./oauth.js";
export { PinterestPublisher } from "./publisher.js";
export { PinterestAnalyticsPoller, PINTEREST_DEFAULT_METRICS } from "./analytics-poller.js";

/** Non-secret Pinterest connector configuration. */
export interface PinterestConnectorConfig {
  /** v5 REST base host incl. the `/v5` segment. */
  apiBaseUrl: string;
  /** Public base URL the OAuth callback router is reachable at. */
  oauthCallbackBaseUrl: string;
}

/** Minimal vault surface the connector reads (no secrets returned/logged). */
export interface PinterestConnectorVault {
  getPinterest(): Promise<PinterestAppCredential | undefined>;
}

export interface RegisterPinterestConnectorsDeps {
  config: PinterestConnectorConfig;
  registries: { oauth: ConnectorRegistry };
  vault: PinterestConnectorVault;
  broker: RateLimitBroker;
  dlq: DlqRepository;
  insights: InsightsRepository;
  fetchImpl?: FetchLike;
}

export interface PinterestConnectors {
  client: PinterestRestClient;
  dispatcher: PinterestDispatcher;
  publisher: PinterestPublisher;
  analyticsPoller: PinterestAnalyticsPoller;
}

function callbackUrl(base: string, platform: string): string {
  return `${base.replace(/\/$/, "")}/oauth/callback/${platform}`;
}

export async function registerPinterestConnectors(
  deps: RegisterPinterestConnectorsDeps
): Promise<PinterestConnectors> {
  const { config, registries, vault, broker, dlq, insights, fetchImpl } = deps;

  const getAppCredentials = async (): Promise<PinterestAppCredentials | undefined> => {
    const cred = await vault.getPinterest();
    return cred ? { appId: cred.appId, appSecret: cred.appSecret } : undefined;
  };

  registries.oauth.register(
    new PinterestOAuthExchanger({
      redirectUri: callbackUrl(config.oauthCallbackBaseUrl, "pinterest"),
      getAppCredentials,
      fetchImpl
    })
  );

  const client = new PinterestRestClient({ baseUrl: config.apiBaseUrl, fetchImpl });
  const dispatcher = new PinterestDispatcher({ broker, dlq });
  const publisher = new PinterestPublisher({ client, dispatcher });
  const analyticsPoller = new PinterestAnalyticsPoller({ client, insights, dispatcher });

  return { client, dispatcher, publisher, analyticsPoller };
}

export { InsightsRepository };
