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
import express, { type Express, type Request, type Response } from "express";
import helmet from "helmet";

import type { CredentialVault } from "../vault/index.js";
import type { Metrics } from "./metrics.js";
import { createSetupRouter, type SetupRouterDeps } from "./setup/router.js";

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
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const startedAt = deps.startedAt ?? Date.now();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));

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
  }
  app.use("/api", api);

  return app;
}
