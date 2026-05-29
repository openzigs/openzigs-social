import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLogger } from "./logger.js";

describe("createLogger", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ozs-logger-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a stdout-only logger by default", () => {
    const log = createLogger({ toFile: false, level: "debug" });
    expect(log.level).toBe("debug");
    expect(log.transports).toHaveLength(1);
  });

  it("adds a file transport and writes redacted JSON", async () => {
    const log = createLogger({ toFile: true, dir });
    expect(log.transports).toHaveLength(2);
    log.info("hello", { apiKey: "sk-secret", user: "bob" });
    await new Promise((r) => setTimeout(r, 50));
    const file = join(dir, "openzigs-social.log");
    expect(existsSync(file)).toBe(true);
    const contents = readFileSync(file, "utf8");
    expect(contents).toContain("[REDACTED]");
    expect(contents).not.toContain("sk-secret");
    expect(contents).toContain("bob");
  });
});
