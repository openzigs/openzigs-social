import { io, type Socket } from "socket.io-client";

import { getClientId, persistClientId } from "./client-id";

/** Payload emitted by the server on `session:restored`. */
export interface SessionRestored {
  sessionId: string;
  restored: boolean;
  messageCount: number;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Create a Socket.IO client wired to the server's client-id session contract.
 *
 * - Sends the persisted UUID in the handshake `auth.clientId`.
 * - On `session:restored`, persists the server-assigned `sessionId` so the
 *   next connection resumes the same transcript.
 */
export function createSocket(url: string = API_URL): Socket {
  const clientId = getClientId();

  const socket = io(url, {
    autoConnect: true,
    transports: ["websocket"],
    auth: { clientId }
  });

  socket.on("session:restored", (payload: SessionRestored) => {
    if (payload?.sessionId) {
      persistClientId(payload.sessionId);
    }
  });

  return socket;
}
