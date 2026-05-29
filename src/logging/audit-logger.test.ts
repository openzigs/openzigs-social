import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditLogger } from "./audit-logger.js";

describe("AuditLogger", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-audit-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends redacted JSONL entries with id, timestamp and category", async () => {
    const fixed = new Date("2026-05-29T00:00:00.000Z");
    const audit = new AuditLogger({ dir, clock: () => fixed });
    const entry = await audit.log({
      category: "oauth",
      event: "token.refreshed",
      details: { platform: "twitter", accessToken: "secret-token" }
    });

    expect(entry.id).toMatch(/[0-9a-f-]{36}/);
    expect(entry.timestamp).toBe("2026-05-29T00:00:00.000Z");
    expect(entry.category).toBe("oauth");

    const raw = readFileSync(audit.path, "utf8").trim();
    const parsed = JSON.parse(raw) as Record<string, any>;
    expect(parsed.details.accessToken).toBe("[REDACTED]");
    expect(parsed.details.platform).toBe("twitter");
  });

  it("creates the audit file with 0600 mode", async () => {
    const audit = new AuditLogger({ dir });
    await audit.log({ category: "auth", event: "login" });
    if (process.platform !== "win32") {
      const st = await stat(audit.path);
      expect(st.mode & 0o777).toBe(0o600);
    }
  });

  it("serialises concurrent writes without interleaving", async () => {
    const audit = new AuditLogger({ dir });
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => audit.log({ category: "publish", event: `e${i}` }))
    );
    const entries = await audit.read();
    expect(entries).toHaveLength(25);
    expect(new Set(entries.map((e) => e.event)).size).toBe(25);
  });

  it("returns [] when no audit file exists", async () => {
    const audit = new AuditLogger({ dir: join(dir, "missing") });
    expect(await audit.read()).toEqual([]);
  });

  it("includes optional correlation ids only when provided", async () => {
    const audit = new AuditLogger({ dir });
    await audit.log({ category: "config", event: "loaded", sessionId: "s1", actor: "system" });
    const [entry] = await audit.read();
    expect(entry?.sessionId).toBe("s1");
    expect(entry?.actor).toBe("system");
  });
});
