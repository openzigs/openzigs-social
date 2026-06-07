/**
 * Express application factory.
 *
 * - helmet for baseline security headers.
 * - JSON body parsing.
 * - `/health` (liveness) and `/ready` (readiness) endpoints.
 * - `/api` router with `/api/metrics`.
 *
 * The HTTP server + Socket.IO wiring lives in ./index.ts; this factory is kept
 * dependency-injected so it can be exercised without opening sockets.
 */
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  type Router
} from "express";
import helmet from "helmet";

import type { CredentialVault } from "../vault/index.js";
import type { Metrics } from "./metrics.js";
import { createSetupRouter, type SetupRouterDeps } from "./setup/router.js";
import { createConnectionsRouter } from "./connections/router.js";

export interface ReadinessReport {
  db: boolean;
  config: boolean;
  vault: boolean;
}

export interface AppDeps {
  metrics: Metrics;
  /** Resolve current readiness; all-true => 200, any-false => 503. */
  checkReadiness: () => ReadinessReport | Promise<ReadinessReport>;
  /** Process start time for uptime reporting. */
  startedAt?: number;
  /** Credential vault. When provided, mounts the setup-wizard routes (#129). */
  vault?: CredentialVault;
  /** Optional overrides for the setup router (used in tests). */
  setup?: Omit<SetupRouterDeps, "vault">;
  /**
   * Pre-built platform-service routers (#127), mounted when provided. They are
   * constructed in ./index.ts from the connector registries so this factory
   * stays decoupled from the platform internals (and trivially testable).
   */
  platform?: {
    /** OAuth callback router (#139), mounted at `/oauth`. */
    oauthRouter?: Router;
    /**
     * Webhook receiver router (#140), mounted at `/webhooks`. It captures the
     * raw request body for HMAC verification, so it MUST be mounted before the
     * global JSON body parser.
     */
    webhookRouter?: Router;
  };
  /**
   * Pre-built X (Twitter) quota router (#66), mounted at `/api/twitter` when
   * provided. Built in ./index.ts only when the connector is enabled.
   */
  twitterRouter?: Router;
  /**
   * Pre-built unified inbox router (epic #71), mounted at `/api/inbox` when
   * provided. Built in ./index.ts from the DB + SocialBrain + DM sender
   * registry so this factory stays decoupled from the inbox internals.
   */
  inboxRouter?: Router;
  /**
   * Pre-built outbox router (epic #84), mounted at `/api/outbox` when provided.
   * Built in ./index.ts from the DB + DLQ so this factory stays decoupled from
   * the outbox internals.
   */
  outboxRouter?: Router;
  /**
   * Pre-built auto-reply / brand-voice router (epic #78), mounted at
   * `/api/auto-reply` when provided. Built in ./index.ts from the rulebook +
   * audit repos + pipeline so this factory stays decoupled from the internals.
   */
  autoReplyRouter?: Router;
  /**
   * Pre-built analytics dashboard router (epic #95), mounted at
   * `/api/analytics` when provided. Built in ./index.ts from the analytics
   * cache repository so this factory stays decoupled from the rollup internals.
   */
  analyticsRouter?: Router;
  /**
   * Pre-built Light CRM router (epic #90), mounted at `/api/contacts` when
   * provided. Built in ./index.ts from the CRM repository so this factory stays
   * decoupled from the SQLite internals.
   */
  contactsRouter?: Router;
  /**
   * Pre-built model panel router (epic #100, sub #102), mounted at
   * `/api/model` when provided. Surfaces the Ollama probe, Gemma 4 variant
   * recommendation, BYOK provider chips, and the active model selection.
   */
  modelRouter?: Router;
  /**
   * Pre-built social setup router (epic #100, sub #105/#106), mounted at
   * `/api/social-setup` when provided. Drives the per-platform OAuth flow and
   * the per-user Meta app wizard.
   */
  socialSetupRouter?: Router;
  /**
   * Pre-built onboarding router (epic #100, sub #107 + epic AC), mounted at
   * `/api/onboarding` when provided. Serves the starter recipe presets and
   * brand-voice import.
   */
  onboardingRouter?: Router;
  /**
   * Pre-built YouTube quota router (epic #58), mounted at `/api/youtube` when
   * provided. Reads only the non-secret daily quota ledger.
   */
  youtubeRouter?: Router;
  /**
   * Pre-built backup router (#147), mounted at `/api/backup` when provided.
   * Handles encrypted export and import of the DB + vault bundle.
   */
  backupRouter?: Router;
  /**
   * Allowed browser origin for CORS. The UI (Next.js dev server) runs on a
   * different port than the REST API, so the browser issues cross-origin
   * requests that need an `Access-Control-Allow-Origin` header. Mirrors the
   * Socket.IO CORS posture (single configured origin, no credentials).
   * Defaults to the same value the config schema uses for `server.uiOrigin`.
   */
  uiOrigin?: string;
}

/**
 * Minimal CORS middleware scoped to a single configured origin.
 *
 * Hand-rolled (rather than pulling in the `cors` package) to keep the
 * dependency surface small and the behavior auditable. It:
 *   - Echoes the configured origin in `Access-Control-Allow-Origin` ONLY when
 *     the request's `Origin` matches exactly — never a wildcard, never a
 *     reflection of arbitrary origins.
 *   - Sets `Vary: Origin` so caches don't serve a response for the wrong origin.
 *   - Advertises the methods + headers the UI actually uses.
 *   - Short-circuits preflight `OPTIONS` with 204.
 *
 * Credentials are intentionally NOT enabled, matching socket.ts (which sets no
 * `credentials` flag) so the two CORS layers stay consistent.
 */
export function createCorsMiddleware(allowedOrigin: string) {
  return function cors(req: Request, res: Response, next: NextFunction): void {
    res.setHeader("Vary", "Origin");
    const origin = req.headers.origin;
    if (origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      // Single source of truth for the methods the API actually serves across
      // every mounted router. PUT is used by the brand-voice rulebook (#78) and
      // inbox rule updates (#71); DELETE by inbox rule removal (#71). Keep this
      // list in sync when a router adds a new verb — the CORS layer is global,
      // so an omitted method silently breaks cross-origin preflight.
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      // Preflight: respond immediately. The ACAO header (set above when the
      // origin is allowed) is what the browser checks; a disallowed origin
      // gets a 204 with no ACAO header and the browser blocks the request.
      res.status(204).end();
      return;
    }
    next();
  };
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const startedAt = deps.startedAt ?? Date.now();

  app.disable("x-powered-by");
  app.use(helmet());
  // CORS for the browser UI (cross-origin from the Next.js dev server). Mounted
  // after helmet so its baseline headers apply, and before the API router so
  // the ACAO header is present on both preflight and actual responses. helmet's
  // defaults (CORP `same-origin`, COEP off in v7) do not strip ACAO, so no
  // helmet adjustment is needed.
  app.use(createCorsMiddleware(deps.uiOrigin ?? "http://localhost:3001"));

  // Webhook receiver (#140) is mounted BEFORE the JSON parser because it must
  // read the raw request body to verify the HMAC signature. Its own router
  // applies an `express.raw` middleware scoped to `/webhooks`.
  if (deps.platform?.webhookRouter) {
    app.use("/webhooks", deps.platform.webhookRouter);
  }

  app.use(express.json({ limit: "1mb" }));

  // OAuth callback (#139) uses only query params, so it can mount after JSON.
  if (deps.platform?.oauthRouter) {
    app.use("/oauth", deps.platform.oauthRouter);
  }

  // Liveness: 200 as long as the process is up.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", uptimeMs: Date.now() - startedAt });
  });

  // Readiness: 200 only when every dependency is ready.
  app.get("/ready", async (_req: Request, res: Response) => {
    const checks = await deps.checkReadiness();
    const ready = checks.db && checks.config && checks.vault;
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", checks });
  });

  const api = express.Router();
  api.get("/metrics", (_req: Request, res: Response) => {
    res.status(200).json({ timestamp: new Date().toISOString(), metrics: deps.metrics.snapshot() });
  });
  if (deps.vault) {
    api.use("/setup", createSetupRouter({ vault: deps.vault, ...deps.setup }));
    api.use("/connections", createConnectionsRouter({ vault: deps.vault }));
  }
  if (deps.twitterRouter) {
    api.use("/twitter", deps.twitterRouter);
  }
  if (deps.inboxRouter) {
    api.use("/inbox", deps.inboxRouter);
  }
  if (deps.outboxRouter) {
    api.use("/outbox", deps.outboxRouter);
  }
  if (deps.autoReplyRouter) {
    api.use("/auto-reply", deps.autoReplyRouter);
  }
  if (deps.analyticsRouter) {
    api.use("/analytics", deps.analyticsRouter);
  }
  if (deps.contactsRouter) {
    api.use("/contacts", deps.contactsRouter);
  }
  if (deps.modelRouter) {
    api.use("/model", deps.modelRouter);
  }
  if (deps.socialSetupRouter) {
    api.use("/social-setup", deps.socialSetupRouter);
  }
  if (deps.onboardingRouter) {
    api.use("/onboarding", deps.onboardingRouter);
  }
  if (deps.youtubeRouter) {
    api.use("/youtube", deps.youtubeRouter);
  }
  if (deps.backupRouter) {
    api.use("/backup", deps.backupRouter);
  }
  app.use("/api", api);

  return app;
}
