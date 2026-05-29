/**
 * Socket.IO wiring.
 *
 * - CORS locked to the configured UI origin.
 * - Client-id session restoration: the client supplies a `clientId` (handshake
 *   auth or query); the server restores the matching transcript session or
 *   creates a fresh one, then emits `session:restored`.
 * - Broadcasts `metrics:update` whenever the metrics counter changes.
 */
import type { Server as HttpServer } from "node:http";

import { Server as SocketIOServer, type Socket } from "socket.io";

import type { Metrics } from "./metrics.js";
import type { TranscriptManager } from "../sessions/transcript-manager.js";

export interface SocketDeps {
  uiOrigin: string;
  transcripts: TranscriptManager;
  metrics: Metrics;
}

function readClientId(socket: Socket): string | undefined {
  const fromAuth = (socket.handshake.auth as { clientId?: unknown } | undefined)?.clientId;
  if (typeof fromAuth === "string" && fromAuth.length > 0) return fromAuth;
  const fromQuery = socket.handshake.query?.clientId;
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  return undefined;
}

/** Restore an existing transcript session for `clientId`, or create one. */
export async function restoreSession(
  transcripts: TranscriptManager,
  clientId: string
): Promise<{ sessionId: string; restored: boolean; messageCount: number }> {
  try {
    const data = await transcripts.load(clientId);
    return { sessionId: data.meta.id, restored: true, messageCount: data.meta.messageCount };
  } catch {
    const meta = await transcripts.create({ id: clientId });
    return { sessionId: meta.id, restored: false, messageCount: 0 };
  }
}

/** Create + configure the Socket.IO server bound to `httpServer`. */
export function createSocketServer(httpServer: HttpServer, deps: SocketDeps): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: deps.uiOrigin, methods: ["GET", "POST"] }
  });

  const onMetrics = (snapshot: unknown): void => {
    io.emit("metrics:update", snapshot);
  };
  deps.metrics.on("update", onMetrics);
  io.on("close", () => deps.metrics.off("update", onMetrics));

  io.on("connection", (socket) => {
    socket.emit("status:update", { connected: true });

    const clientId = readClientId(socket);
    if (clientId !== undefined) {
      socket.join(clientId);
      restoreSession(deps.transcripts, clientId)
        .then((result) => socket.emit("session:restored", result))
        .catch((err: unknown) => {
          socket.emit("session:error", {
            message: err instanceof Error ? err.message : String(err)
          });
        });
    }
  });

  return io;
}
