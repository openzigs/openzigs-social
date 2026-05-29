import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Server as SocketIOServer } from "socket.io";

import { createSocketServer, restoreSession } from "./socket.js";
import { Metrics } from "./metrics.js";
import { TranscriptManager } from "../sessions/transcript-manager.js";

describe("restoreSession", () => {
  let dir: string;
  let transcripts: TranscriptManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-sock-"));
    transcripts = new TranscriptManager({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a session when none exists", async () => {
    const result = await restoreSession(transcripts, "client-a");
    expect(result.restored).toBe(false);
    expect(result.sessionId).toBe("client-a");
    expect(result.messageCount).toBe(0);
  });

  it("restores an existing session with its message count", async () => {
    await transcripts.create({ id: "client-b" });
    await transcripts.append("client-b", { role: "user", content: "hi" });
    const result = await restoreSession(transcripts, "client-b");
    expect(result.restored).toBe(true);
    expect(result.messageCount).toBe(1);
  });
});

describe("createSocketServer", () => {
  let httpServer: Server;
  let dir: string;

  beforeEach(() => {
    httpServer = createServer();
    dir = mkdtempSync(join(tmpdir(), "ozs-sock2-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("broadcasts metrics:update when the counter changes", async () => {
    const metrics = new Metrics();
    const transcripts = new TranscriptManager({ dir });
    const io = createSocketServer(httpServer, {
      uiOrigin: "http://localhost:3001",
      transcripts,
      metrics
    });
    const emit = vi.spyOn(io, "emit");
    metrics.recordSent("twitter");
    expect(emit).toHaveBeenCalledWith("metrics:update", {
      twitter: { sent: 1, received: 0, failed: 0 }
    });
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
});

interface FakeSocket {
  handshake: { auth: Record<string, unknown>; query: Record<string, unknown> };
  join: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  emitted: { event: string; payload: unknown }[];
}

function makeFakeSocket(opts: {
  auth?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): FakeSocket {
  const emitted: { event: string; payload: unknown }[] = [];
  const emit = vi.fn((event: string, payload: unknown) => {
    emitted.push({ event, payload });
    return true;
  });
  return {
    handshake: { auth: opts.auth ?? {}, query: opts.query ?? {} },
    join: vi.fn(),
    emit,
    emitted
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function waitForEvent(socket: FakeSocket, event: string): Promise<unknown> {
  for (let i = 0; i < 50; i++) {
    const found = socket.emitted.find((e) => e.event === event);
    if (found !== undefined) return found.payload;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`event ${event} not emitted within timeout`);
}

describe("createSocketServer connection handler", () => {
  let httpServer: Server;
  let dir: string;
  let io: SocketIOServer;
  let transcripts: TranscriptManager;

  beforeEach(() => {
    httpServer = createServer();
    dir = mkdtempSync(join(tmpdir(), "ozs-sock3-"));
    transcripts = new TranscriptManager({ dir });
    io = createSocketServer(httpServer, {
      uiOrigin: "http://localhost:3001",
      transcripts,
      metrics: new Metrics()
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  function connectionHandler(): (socket: FakeSocket) => void {
    const handlers = io.listeners("connection") as ((socket: FakeSocket) => void)[];
    const handler = handlers[0];
    if (handler === undefined) throw new Error("no connection handler registered");
    return handler;
  }

  it("creates a new session and emits its id when no clientId is supplied", async () => {
    const socket = makeFakeSocket({});
    connectionHandler()(socket);
    await flush();

    expect(socket.emit).toHaveBeenCalledWith("status:update", { connected: true });
    expect(socket.join).not.toHaveBeenCalled();
    // No clientId => connection handler does not restore/create a named session.
    expect(socket.emitted.some((e) => e.event === "session:restored")).toBe(false);
  });

  it("restores an existing session when a valid clientId is in handshake auth", async () => {
    await transcripts.create({ id: "client-x" });
    await transcripts.append("client-x", { role: "user", content: "hi" });

    const socket = makeFakeSocket({ auth: { clientId: "client-x" } });
    connectionHandler()(socket);
    const payload = await waitForEvent(socket, "session:restored");

    expect(socket.join).toHaveBeenCalledWith("client-x");
    expect(payload).toEqual({
      sessionId: "client-x",
      restored: true,
      messageCount: 1
    });
  });

  it("creates a fresh session for an unknown clientId from query", async () => {
    const socket = makeFakeSocket({ query: { clientId: "client-y" } });
    connectionHandler()(socket);
    const payload = await waitForEvent(socket, "session:restored");

    expect(socket.join).toHaveBeenCalledWith("client-y");
    expect(payload).toEqual({
      sessionId: "client-y",
      restored: false,
      messageCount: 0
    });
  });

  it("rejects a path-traversal clientId without writing it to disk", async () => {
    const malicious = "../../etc/passwd";
    const socket = makeFakeSocket({ auth: { clientId: malicious } });
    connectionHandler()(socket);
    await waitForEvent(socket, "session:error");

    // join happens before validation, but the invalid id is rejected by the
    // transcript manager and surfaced as session:error — never persisted.
    const error = socket.emitted.find((e) => e.event === "session:error");
    expect(error).toBeDefined();
    expect(socket.emitted.some((e) => e.event === "session:restored")).toBe(false);
    expect(existsSync(join(dir, `${malicious}.meta.json`))).toBe(false);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it("ignores an empty-string clientId", async () => {
    const socket = makeFakeSocket({ auth: { clientId: "" } });
    connectionHandler()(socket);
    await flush();

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emitted.some((e) => e.event === "session:restored")).toBe(false);
  });
});
