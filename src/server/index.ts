/**
 * Server bootstrap: composes config, logging, SQLite, sessions, metrics, the
 * Express app, and Socket.IO into a running server with graceful shutdown.
 */
import { createServer, type Server as HttpServer } from "node:http";

import type { Express } from "express";
import type { Server as SocketIOServer } from "socket.io";
import type { Database } from "better-sqlite3";

import { getConfig } from "../config/index.js";
import { existsSync, statSync } from "node:fs";
import { vaultPath } from "../config/paths.js";
import { ApprovalQueue } from "../approvals/index.js";
import {
  createTelegramChannelFromVault,
  type TelegramChannel
} from "../channels/telegram/index.js";
import { AuditLogger } from "../logging/audit-logger.js";
import { createLogger } from "../logging/logger.js";
import { closeDb, getDb } from "../db/index.js";
import { TranscriptManager } from "../sessions/transcript-manager.js";
import { CredentialVault } from "../vault/index.js";
import {
  ConnectorRegistry,
  OAuthStateStore,
  SocialDmSenderRegistry,
  WebhookEventStore,
  WebhookHandlerRegistry,
  RateLimitBroker,
  DlqRepository,
  SocialBrainRepository,
  createOAuthRouter,
  createWebhookRouter
} from "../platform/index.js";
import { registerMetaConnectors } from "../connectors/meta/index.js";
import { InsightsRepository } from "../connectors/meta/insights/repository.js";
import { registerLinkedInConnectors } from "../connectors/linkedin/index.js";
import { registerPinterestConnectors } from "../connectors/pinterest/index.js";
import { registerTikTokConnectors } from "../connectors/tiktok/index.js";
import { registerTwitterConnectors } from "../connectors/twitter/index.js";
import { tierWriteQuota } from "../connectors/twitter/tiers.js";
import { createTwitterRouter } from "./twitter/router.js";
import { createApp, type ReadinessReport } from "./app.js";
import { metrics as defaultMetrics, type Metrics } from "./metrics.js";
import { createSocketServer } from "./socket.js";

/** Live platform-service registries connectors register their adapters into. */
export interface PlatformRegistries {
  /** OAuth token exchangers, keyed by platform (#139). */
  oauth: ConnectorRegistry;
  /** Inbound webhook handlers, keyed by platform (#140). */
  webhooks: WebhookHandlerRegistry;
  /** Outbound DM sender adapters; satisfies the #51 SocialDmSender port (#144). */
  dmSenders: SocialDmSenderRegistry;
}

export interface StartedServer {
  app: Express;
  httpServer: HttpServer;
  io: SocketIOServer;
  db: Database;
  metrics: Metrics;
  port: number;
  /** Platform-service registries (#127) for connectors to register into. */
  platform: PlatformRegistries;
  close: () => Promise<void>;
}

/** Build the readiness probe from live dependencies. */
export function buildReadinessCheck(db: Database): () => ReadinessReport {
  return () => ({
    db: db.open,
    config: (() => {
      try {
        getConfig();
        return true;
      } catch {
        return false;
      }
    })(),
    vault: (() => {
      // Fresh installs have no vault yet (ready); an existing vault must be a
      // regular file we can stat.
      try {
        return existsSync(vaultPath()) ? statSync(vaultPath()).isFile() : true;
      } catch {
        return false;
      }
    })()
  });
}

/** Start the HTTP + Socket.IO server. Resolves once listening. */
export async function startServer(): Promise<StartedServer> {
  const config = getConfig();
  const logger = createLogger({ level: config.logging.level, toFile: config.logging.toFile });
  const audit = new AuditLogger();
  const db = getDb();
  const transcripts = new TranscriptManager();
  const metrics = defaultMetrics;
  const vault = new CredentialVault();

  // Platform-service registries (#127). Connectors (Cohorts A/B/C) register
  // their adapters into these at startup; the routers below dispatch through
  // them. Empty registries simply yield 404s for unknown platforms.
  const platform: PlatformRegistries = {
    oauth: new ConnectorRegistry(),
    webhooks: new WebhookHandlerRegistry(),
    dmSenders: new SocialDmSenderRegistry()
  };

  // Adapt the winston logger to the (obj, msg) shape the platform routers use.
  const routeLogger = {
    info: (obj: unknown, msg?: string) => logger.info(msg ?? "", obj),
    warn: (obj: unknown, msg?: string) => logger.warn(msg ?? "", obj),
    error: (obj: unknown, msg?: string) => logger.error(msg ?? "", obj)
  };

  // Meta (Cohort A) connectors (#53) — opt-in. Registers OAuth exchangers,
  // webhook handlers, and the IG DM sender into the platform registries; one
  // shared rate-limit budget governs IG/FB/Threads. App creds/tokens are read
  // from the vault (BYOK) and never logged.
  if (config.platform.meta.enabled) {
    const broker = new RateLimitBroker({
      budgets: {
        meta: {
          capacity: config.platform.meta.budget.requests,
          refillPerSec:
            config.platform.meta.budget.requests / (config.platform.meta.budget.windowMs / 1000)
        }
      }
    });
    try {
      await registerMetaConnectors({
        config: {
          graphBaseUrl: config.platform.meta.graphBaseUrl,
          threadsBaseUrl: config.platform.meta.threadsBaseUrl,
          oauthCallbackBaseUrl: `http://${config.server.host}:${config.server.port}`
        },
        registries: platform,
        vault,
        broker,
        dlq: new DlqRepository(db)
      });
    } catch (err) {
      logger.error("meta.register_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // Cohort B connectors (#60) — opt-in, each with its own rate-limit budget.
  // App creds/tokens are read from the vault (BYOK) and never logged. They
  // share the SocialBrain (#143) and analytics (#96) stores with Cohort A.
  const oauthCallbackBaseUrl = `http://${config.server.host}:${config.server.port}`;

  // Deferred sinks for the X write-quota guard (#70). The socket server and the
  // Telegram channel are created later in startup, so the guard emits through
  // these references which are populated once those exist.
  const quotaSink: {
    emit?: (event: string, payload: unknown) => void;
    alert?: (text: string) => void;
  } = {};

  if (config.platform.linkedin.enabled) {
    try {
      await registerLinkedInConnectors({
        config: {
          restBaseUrl: config.platform.linkedin.restBaseUrl,
          oauthCallbackBaseUrl
        },
        registries: platform,
        vault,
        brain: new SocialBrainRepository(db),
        broker: new RateLimitBroker({
          budgets: {
            linkedin: {
              capacity: config.platform.linkedin.budget.requests,
              refillPerSec:
                config.platform.linkedin.budget.requests /
                (config.platform.linkedin.budget.windowMs / 1000)
            }
          }
        }),
        dlq: new DlqRepository(db),
        insights: new InsightsRepository(db)
      });
    } catch (err) {
      logger.error("linkedin.register_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  if (config.platform.pinterest.enabled) {
    try {
      await registerPinterestConnectors({
        config: {
          apiBaseUrl: config.platform.pinterest.apiBaseUrl,
          oauthCallbackBaseUrl
        },
        registries: platform,
        vault,
        broker: new RateLimitBroker({
          budgets: {
            pinterest: {
              capacity: config.platform.pinterest.budget.requests,
              refillPerSec:
                config.platform.pinterest.budget.requests /
                (config.platform.pinterest.budget.windowMs / 1000)
            }
          }
        }),
        dlq: new DlqRepository(db),
        insights: new InsightsRepository(db)
      });
    } catch (err) {
      logger.error("pinterest.register_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  if (config.platform.tiktok.enabled) {
    try {
      await registerTikTokConnectors({
        config: {
          apiBaseUrl: config.platform.tiktok.apiBaseUrl,
          oauthCallbackBaseUrl
        },
        registries: platform,
        vault,
        broker: new RateLimitBroker({
          budgets: {
            tiktok: {
              capacity: config.platform.tiktok.budget.requests,
              refillPerSec:
                config.platform.tiktok.budget.requests /
                (config.platform.tiktok.budget.windowMs / 1000)
            }
          }
        }),
        dlq: new DlqRepository(db),
        insights: new InsightsRepository(db)
      });
    } catch (err) {
      logger.error("tiktok.register_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // X / Twitter (Cohort C) connector (#66) — opt-in, own rate-limit budgets.
  // App client id/secret + per-account tokens are read from the vault (BYOK)
  // and never logged. The DM surface is force-disabled on the Free tier. The
  // write-quota guard (#69/#70) pushes threshold/exhaustion notices to the
  // model panel (socket) and Telegram via the deferred `quotaSink`.
  if (config.platform.twitter.enabled) {
    try {
      const tw = config.platform.twitter;
      await registerTwitterConnectors({
        config: {
          apiBaseUrl: tw.apiBaseUrl,
          tokenUrl: tw.tokenUrl,
          tier: tw.tier,
          dmEnabled: tw.dmEnabled,
          writeQuota: tw.writeQuota,
          warnThreshold: tw.warnThreshold,
          oauthCallbackBaseUrl
        },
        registries: platform,
        vault,
        brain: new SocialBrainRepository(db),
        broker: new RateLimitBroker({
          budgets: {
            twitter: {
              capacity: tw.budget.requests,
              refillPerSec: tw.budget.requests / (tw.budget.windowMs / 1000)
            },
            "twitter-dm": {
              capacity: tw.dmBudget.requests,
              refillPerSec: tw.dmBudget.requests / (tw.dmBudget.windowMs / 1000),
              quota: tw.dmBudget.dailyQuota
            }
          }
        }),
        dlq: new DlqRepository(db),
        insights: new InsightsRepository(db),
        db,
        getAccount: async () => {
          const tok = await vault.getOAuth("twitter");
          return tok ? { accessToken: tok.accessToken } : undefined;
        },
        emit: (event, payload) => quotaSink.emit?.(event, payload),
        alert: (text) => quotaSink.alert?.(text)
      });
    } catch (err) {
      logger.error("twitter.register_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  // OAuth callback router (#139) — opt-in.
  const oauthRouter = config.platform.oauth.enabled
    ? createOAuthRouter({
        registry: platform.oauth,
        stateStore: new OAuthStateStore({ ttlMs: config.platform.oauth.stateTtlMs }),
        vault,
        successRedirect: config.platform.oauth.successRedirect,
        logger: routeLogger
      })
    : undefined;

  // Webhook receiver router (#140) — opt-in.
  const webhookRouter = config.platform.webhooks.enabled
    ? createWebhookRouter({
        registry: platform.webhooks,
        eventStore: new WebhookEventStore(db),
        maxBodyBytes: config.platform.webhooks.maxBodyBytes,
        logger: routeLogger
      })
    : undefined;

  // X (Twitter) quota router (#66) — opt-in, exposes month-to-date write usage.
  const twitterRouter = config.platform.twitter.enabled
    ? createTwitterRouter({
        db,
        tier: config.platform.twitter.tier,
        cap: tierWriteQuota(config.platform.twitter.tier, config.platform.twitter.writeQuota)
      })
    : undefined;

  const app = createApp({
    metrics,
    checkReadiness: buildReadinessCheck(db),
    vault,
    uiOrigin: config.server.uiOrigin,
    platform: { oauthRouter, webhookRouter },
    twitterRouter
  });
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, {
    uiOrigin: config.server.uiOrigin,
    transcripts,
    metrics
  });
  // The X write-quota guard (#70) can now emit model-panel updates.
  quotaSink.emit = (event, payload) => io.emit(event, payload);

  await new Promise<void>((resolve) => {
    httpServer.listen(config.server.port, config.server.host, resolve);
  });
  const address = httpServer.address();
  const port = typeof address === "object" && address !== null ? address.port : config.server.port;

  logger.info("server.listening", { host: config.server.host, port });
  await audit.log({ category: "config", event: "server.started", details: { port } });

  // Telegram remote-control channel (epic #47). Opt-in via config; never blocks
  // server start. The bot token + admin chat id come from the encrypted vault.
  let telegram: TelegramChannel | undefined;
  if (config.telegram.enabled) {
    try {
      telegram = await createTelegramChannelFromVault({
        vault: new CredentialVault(),
        config: config.telegram,
        approvals: new ApprovalQueue({ defaultTimeoutMs: config.telegram.approvalTimeoutMs }),
        dmSender: platform.dmSenders,
        logger
      });
      await telegram?.start();
    } catch (err) {
      logger.error("telegram.start_failed", {
        error: err instanceof Error ? err.message : String(err)
      });
      telegram = undefined;
    }
  }
  // Route X write-quota alerts (#70) to Telegram once the channel exists.
  if (telegram) {
    const channel = telegram;
    quotaSink.alert = (text) => void channel.notify(text);
  }

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (telegram) await telegram.stop().catch(() => undefined);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    closeDb();
    logger.info("server.stopped");
  };

  return { app, httpServer, io, db, metrics, port, platform, close };
}
