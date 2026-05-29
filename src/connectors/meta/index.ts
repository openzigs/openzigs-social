/**
 * Meta (Cohort A) connector module — public surface + wiring entrypoint (#53).
 *
 * Cohort A (Instagram #54/#55/#56, Facebook Pages #57, Threads #135/#136/#137,
 * webhooks #59, shared insights #96) is a *connector* that plugs into the
 * connector-agnostic platform-service backbone (#127). It owns zero rate-limit,
 * retry, webhook-verify, or OAuth-callback machinery of its own — it consumes
 * the exported #127 ports:
 *
 *   - {@link OAuthTokenExchanger}  → code→token exchange (FB/IG/Threads).
 *   - {@link WebhookHandler}       → HMAC-verified inbound events.
 *   - {@link RateLimitBroker}      → one shared Meta budget (via dispatcher).
 *   - retry / {@link DlqRepository}→ transient retry + dead-letter (via dispatcher).
 *   - {@link SocialBrainRepository}→ cross-platform contacts/threads/messages.
 *   - {@link SocialDmSenderRegistry} → outbound DM relay (#51 port).
 *
 * {@link registerMetaConnectors} performs the one-time registration of these
 * adapters into the live platform registries at server start.
 */
import type {
  ConnectorRegistry,
  DlqRepository,
  RateLimitBroker,
  SocialDmSenderRegistry,
  WebhookEvent,
  WebhookHandlerRegistry
} from "../../platform/index.js";
import type { MetaAppCredential } from "../../vault/index.js";
import { MetaDispatcher } from "./dispatcher.js";
import { MetaGraphClient, type FetchLike } from "./graph-client.js";
import { InstagramDmSender } from "./instagram/dm-sender.js";
import type { IgAccount } from "./instagram/publisher.js";
import { FacebookOAuthExchanger, ThreadsOAuthExchanger, type MetaAppCredentials } from "./oauth.js";
import { createMetaWebhookHandler } from "./webhook-handler.js";

export { MetaGraphClient, META_GRAPH_BASE_URL, THREADS_GRAPH_BASE_URL } from "./graph-client.js";
export { MetaDispatcher } from "./dispatcher.js";
export { MetaScheduler, type SchedulerTask } from "./scheduler.js";
export { createMetaWebhookHandler } from "./webhook-handler.js";
export { InstagramPublisher } from "./instagram/publisher.js";
export { InstagramDmSender } from "./instagram/dm-sender.js";
export { InstagramInboxPoller } from "./instagram/inbox-poller.js";
export { FacebookPages } from "./facebook/pages.js";
export { ThreadsPublisher } from "./threads/publisher.js";
export { ThreadsReplyPoller } from "./threads/reply-poller.js";
export { ThreadsInsightsPoller } from "./threads/insights-poller.js";
export { InsightsRepository } from "./insights/repository.js";

/** Non-secret Meta connector configuration. */
export interface MetaConnectorConfig {
  /** Facebook/Instagram Graph host base incl. version. */
  graphBaseUrl: string;
  /** Threads Graph host base incl. version. */
  threadsBaseUrl: string;
  /**
   * Public base URL the OAuth callback router is reachable at, e.g.
   * `http://localhost:3000`. Per-platform redirect URIs are derived as
   * `${oauthCallbackBaseUrl}/oauth/callback/{platform}`.
   */
  oauthCallbackBaseUrl: string;
}

/** Minimal vault surface the connector reads (no secrets are returned/logged). */
export interface MetaConnectorVault {
  getMeta(): Promise<MetaAppCredential | undefined>;
}

export interface RegisterMetaConnectorsDeps {
  config: MetaConnectorConfig;
  registries: {
    oauth: ConnectorRegistry;
    webhooks: WebhookHandlerRegistry;
    dmSenders: SocialDmSenderRegistry;
  };
  vault: MetaConnectorVault;
  /** Shared rate-limit broker (#141), pre-seeded with the `"meta"` budget. */
  broker: RateLimitBroker;
  /** Dead-letter queue (#142). */
  dlq: DlqRepository;
  /** Processes a verified webhook event (e.g. into SocialBrain). */
  onWebhookEvent?: (event: WebhookEvent) => Promise<void> | void;
  /**
   * Resolves the connected Instagram business account used to send outbound
   * DMs. When omitted, the DM sender is not registered (no IG DM relay).
   */
  getInstagramAccount?: () => Promise<IgAccount | undefined>;
  /** Injected transport for tests. Defaults to global `fetch`. */
  fetchImpl?: FetchLike;
}

/** What registration produced, for the server to build schedulers/pollers. */
export interface MetaConnectors {
  graphClient: MetaGraphClient;
  threadsClient: MetaGraphClient;
  dispatcher: MetaDispatcher;
}

function callbackUrl(base: string, platform: string): string {
  return `${base.replace(/\/$/, "")}/oauth/callback/${platform}`;
}

/**
 * Register all Cohort A adapters into the platform-service registries.
 *
 * OAuth exchangers are always registered (they resolve app creds lazily and
 * fail closed when unset). Webhook handlers and the DM sender are registered
 * only when their prerequisites (app secret / account resolver) are available.
 */
export async function registerMetaConnectors(
  deps: RegisterMetaConnectorsDeps
): Promise<MetaConnectors> {
  const { config, registries, vault, broker, dlq, fetchImpl } = deps;

  const getAppCredentials = async (): Promise<MetaAppCredentials | undefined> => {
    const cred = await vault.getMeta();
    return cred ? { appId: cred.appId, appSecret: cred.appSecret } : undefined;
  };

  // OAuth exchangers (#54/#57/#135) — Facebook + Instagram share the FB flow.
  for (const platform of ["facebook", "instagram"] as const) {
    registries.oauth.register(
      new FacebookOAuthExchanger({
        platform,
        tokenUrl: `${config.graphBaseUrl}/oauth/access_token`,
        longLivedUrl: `${config.graphBaseUrl}/oauth/access_token`,
        redirectUri: callbackUrl(config.oauthCallbackBaseUrl, platform),
        getAppCredentials,
        fetchImpl
      })
    );
  }
  registries.oauth.register(
    new ThreadsOAuthExchanger({
      tokenUrl: `${config.threadsBaseUrl}/oauth/access_token`,
      longLivedUrl: `${config.threadsBaseUrl}/access_token`,
      redirectUri: callbackUrl(config.oauthCallbackBaseUrl, "threads"),
      getAppCredentials,
      fetchImpl
    })
  );

  // Webhook handlers (#59) need the app secret to verify HMACs synchronously.
  const app = await vault.getMeta();
  if (app) {
    for (const platform of ["instagram", "facebook", "threads"] as const) {
      registries.webhooks.register(
        createMetaWebhookHandler({
          platform,
          appSecret: app.appSecret,
          onEvent: (event) => deps.onWebhookEvent?.(event)
        })
      );
    }
  }

  // Shared Graph clients + dispatcher (one Meta budget governs IG/FB/Threads).
  const graphClient = new MetaGraphClient({ baseUrl: config.graphBaseUrl, fetchImpl });
  const threadsClient = new MetaGraphClient({ baseUrl: config.threadsBaseUrl, fetchImpl });
  const dispatcher = new MetaDispatcher({ broker, dlq });

  // Outbound IG DM relay (#55 / #51 port) — only when an account resolver exists.
  if (deps.getInstagramAccount) {
    registries.dmSenders.register(
      "instagram",
      new InstagramDmSender({
        client: graphClient,
        dispatcher,
        getAccount: deps.getInstagramAccount
      })
    );
  }

  return { graphClient, threadsClient, dispatcher };
}
