import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
