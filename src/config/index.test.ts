import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getConfig, loadConfig, resetConfig } from "./index.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ozs-config-"));
}

describe("config layering", () => {
  let dir: string;
  let defaultPath: string;
  let userPath: string;

  beforeEach(() => {
    dir = tmp();
    defaultPath = join(dir, "default.json");
    userPath = join(dir, "user.json");
    writeFileSync(
      defaultPath,
      JSON.stringify({
        server: { host: "127.0.0.1", port: 3000, uiOrigin: "http://localhost:3001" },
        logging: { level: "info", toFile: true },
        privacy: { mode: "off" }
      })
    );
    resetConfig();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    resetConfig();
  });

  it("returns defaults when no user.json or env present", () => {
    const cfg = loadConfig({ defaultPath, userPath, env: {} });
    expect(cfg.server.port).toBe(3000);
    expect(cfg.logging.level).toBe("info");
    expect(cfg.privacy.mode).toBe("off");
  });

  it("user.json overrides default.json", () => {
    writeFileSync(userPath, JSON.stringify({ server: { port: 4100 } }));
    const cfg = loadConfig({ defaultPath, userPath, env: {} });
    expect(cfg.server.port).toBe(4100);
    expect(cfg.server.host).toBe("127.0.0.1");
  });

  it("env overrides user.json which overrides default.json", () => {
    writeFileSync(userPath, JSON.stringify({ server: { port: 4100 }, logging: { level: "warn" } }));
    const cfg = loadConfig({
      defaultPath,
      userPath,
      env: { OPENZIGS_SOCIAL_SERVER_PORT: "5200", OPENZIGS_SOCIAL_LOG_LEVEL: "debug" }
    });
    expect(cfg.server.port).toBe(5200);
    expect(cfg.logging.level).toBe("debug");
  });

  it("coerces numeric and boolean env values", () => {
    const cfg = loadConfig({
      defaultPath,
      userPath,
      env: { OPENZIGS_SOCIAL_SERVER_PORT: "6300", OPENZIGS_SOCIAL_LOG_TO_FILE: "false" }
    });
    expect(cfg.server.port).toBe(6300);
    expect(cfg.logging.toFile).toBe(false);
  });

  it("treats a missing default.json as empty and applies schema defaults", () => {
    const cfg = loadConfig({ defaultPath: join(dir, "nope.json"), userPath, env: {} });
    expect(cfg.server.port).toBe(3000);
  });

  it("throws a readable error on invalid config", () => {
    writeFileSync(userPath, JSON.stringify({ privacy: { mode: "nope" } }));
    expect(() => loadConfig({ defaultPath, userPath, env: {} })).toThrow(/invalid configuration/);
  });

  it("throws on unknown keys (strict schema)", () => {
    writeFileSync(userPath, JSON.stringify({ server: { bogus: 1 } }));
    expect(() => loadConfig({ defaultPath, userPath, env: {} })).toThrow(/invalid configuration/);
  });

  it("throws on malformed JSON", () => {
    writeFileSync(userPath, "{ not json");
    expect(() => loadConfig({ defaultPath, userPath, env: {} })).toThrow(/failed to parse/);
  });

  it("throws when a config file is a JSON array", () => {
    writeFileSync(userPath, "[1,2,3]");
    expect(() => loadConfig({ defaultPath, userPath, env: {} })).toThrow(
      /must contain a JSON object/
    );
  });

  it("rejects an out-of-range port from env", () => {
    expect(() =>
      loadConfig({ defaultPath, userPath, env: { OPENZIGS_SOCIAL_SERVER_PORT: "99999" } })
    ).toThrow(/invalid configuration/);
  });

  it("memoises getConfig", () => {
    const a = getConfig();
    const b = getConfig();
    expect(a).toBe(b);
  });

  it("applies X (Twitter) platform defaults (disabled, free tier, DM off)", () => {
    const cfg = loadConfig({ defaultPath, userPath, env: {} });
    expect(cfg.platform.twitter.enabled).toBe(false);
    expect(cfg.platform.twitter.tier).toBe("free");
    expect(cfg.platform.twitter.dmEnabled).toBe(false);
    expect(cfg.platform.twitter.writeQuota.free).toBe(1_500);
    expect(cfg.platform.twitter.writeQuota.basic).toBe(50_000);
    expect(cfg.platform.twitter.warnThreshold).toBeCloseTo(0.8);
    expect(cfg.platform.twitter.dmBudget.requests).toBe(15);
    expect(cfg.platform.twitter.dmBudget.dailyQuota).toBe(1_440);
  });

  it("maps X (Twitter) env overrides through the alias table", () => {
    const cfg = loadConfig({
      defaultPath,
      userPath,
      env: {
        OPENZIGS_SOCIAL_PLATFORM_TWITTER_ENABLED: "true",
        OPENZIGS_SOCIAL_PLATFORM_TWITTER_TIER: "pro",
        OPENZIGS_SOCIAL_PLATFORM_TWITTER_DM_ENABLED: "true"
      }
    });
    expect(cfg.platform.twitter.enabled).toBe(true);
    expect(cfg.platform.twitter.tier).toBe("pro");
    expect(cfg.platform.twitter.dmEnabled).toBe(true);
  });
});
