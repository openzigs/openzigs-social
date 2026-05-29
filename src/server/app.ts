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
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
  app.use("/api", api);

  return app;
}
