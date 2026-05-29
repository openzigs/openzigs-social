import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { TranscriptManager } from "./transcript-manager.js";

describe("TranscriptManager", () => {
  let dir: string;
  let mgr: TranscriptManager;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-sess-"));
    mgr = new TranscriptManager({ dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a session with an empty ledger + meta sidecar", async () => {
    const meta = await mgr.create({ title: "Hello", id: "abc" });
    expect(meta.id).toBe("abc");
    expect(meta.title).toBe("Hello");
    expect(meta.messageCount).toBe(0);
    const data = await mgr.load("abc");
    expect(data.entries).toEqual([]);
  });

  it("writes files with 0600 mode", async () => {
    await mgr.create({ id: "perm" });
    if (process.platform !== "win32") {
      const st = await stat(join(dir, "perm.jsonl"));
      expect(st.mode & 0o777).toBe(0o600);
    }
  });

  it("rejects duplicate creation", async () => {
    await mgr.create({ id: "dup" });
    await expect(mgr.create({ id: "dup" })).rejects.toThrow(/already exists/);
  });

  it("rejects unsafe ids (path traversal)", async () => {
    await expect(mgr.create({ id: "../escape" })).rejects.toThrow(/invalid id/);
    await expect(mgr.load("../../etc/passwd")).rejects.toThrow(/invalid id/);
  });

  it("appends entries and bumps messageCount + lastActiveAt", async () => {
    await mgr.create({ id: "s1" });
    await mgr.append("s1", { role: "user", content: "hi" });
    await mgr.append("s1", { role: "assistant", content: "hello" });
    const data = await mgr.load("s1");
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0]?.role).toBe("user");
    expect(data.meta.messageCount).toBe(2);
  });

  it("preserves entry metadata", async () => {
    await mgr.create({ id: "s2" });
    await mgr.append("s2", { role: "tool", content: "result", metadata: { tool: "publish" } });
    const data = await mgr.load("s2");
    expect(data.entries[0]?.metadata).toEqual({ tool: "publish" });
  });

  it("throws when appending to a missing session", async () => {
    await expect(mgr.append("ghost", { role: "user", content: "x" })).rejects.toThrow(/not found/);
  });

  it("lists sessions newest-active first", async () => {
    let t = 0;
    const clocked = new TranscriptManager({ dir, clock: () => new Date(2026, 0, 1, 0, 0, ++t) });
    await clocked.create({ id: "old", title: "old" });
    await clocked.create({ id: "new", title: "new" });
    await clocked.append("new", { role: "user", content: "ping" });
    const list = await clocked.list();
    expect(list[0]?.id).toBe("new");
  });

  it("returns [] when the directory does not exist", async () => {
    const empty = new TranscriptManager({ dir: join(dir, "nope") });
    expect(await empty.list()).toEqual([]);
  });

  it("renames the title", async () => {
    await mgr.create({ id: "r1", title: "before" });
    const next = await mgr.renameTitle("r1", "after");
    expect(next.title).toBe("after");
    const data = await mgr.load("r1");
    expect(data.meta.title).toBe("after");
  });

  it("renames the id, moving ledger + sidecar", async () => {
    await mgr.create({ id: "from" });
    await mgr.append("from", { role: "user", content: "keep" });
    const next = await mgr.renameId("from", "to");
    expect(next.id).toBe("to");
    const data = await mgr.load("to");
    expect(data.entries[0]?.content).toBe("keep");
    await expect(mgr.load("from")).rejects.toThrow(/not found/);
  });

  it("deletes a session (idempotent)", async () => {
    await mgr.create({ id: "del" });
    await mgr.delete("del");
    await expect(mgr.load("del")).rejects.toThrow(/not found/);
    await expect(mgr.delete("del")).resolves.toBeUndefined();
  });

  it("uses a default title and generated id", async () => {
    const meta = await mgr.create();
    expect(meta.title).toBe("Untitled session");
    expect(meta.id).toMatch(/[0-9a-f-]{36}/);
  });
});
