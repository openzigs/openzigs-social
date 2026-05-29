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
import { AuditLogger } from "../logging/audit-logger.js";
import { createLogger } from "../logging/logger.js";
import { closeDb, getDb } from "../db/index.js";
import { TranscriptManager } from "../sessions/transcript-manager.js";
import { CredentialVault } from "../vault/index.js";
import { createApp, type ReadinessReport } from "./app.js";
import { metrics as defaultMetrics, type Metrics } from "./metrics.js";
import { createSocketServer } from "./socket.js";

export interface StartedServer {
  app: Express;
  httpServer: HttpServer;
  io: SocketIOServer;
  db: Database;
  metrics: Metrics;
  port: number;
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

  const app = createApp({
    metrics,
    checkReadiness: buildReadinessCheck(db),
    vault: new CredentialVault(),
    uiOrigin: config.server.uiOrigin
  });
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, {
    uiOrigin: config.server.uiOrigin,
    transcripts,
    metrics
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(config.server.port, config.server.host, resolve);
  });
  const address = httpServer.address();
  const port = typeof address === "object" && address !== null ? address.port : config.server.port;

  logger.info("server.listening", { host: config.server.host, port });
  await audit.log({ category: "config", event: "server.started", details: { port } });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    closeDb();
    logger.info("server.stopped");
  };

  return { app, httpServer, io, db, metrics, port, close };
}
