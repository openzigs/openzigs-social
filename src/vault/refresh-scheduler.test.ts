import { describe, expect, it, vi } from "vitest";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CredentialVault } from "./vault.js";
import {
  DEFAULT_REFRESH_WINDOW_MS,
  RefreshRegistry,
  TokenRefreshScheduler
} from "./refresh-scheduler.js";

function makeVault(): CredentialVault {
  const dir = mkdtempSync(join(tmpdir(), "ozs-sched-"));
  return new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "k" });
}

describe("TokenRefreshScheduler", () => {
  it("refreshes a credential inside the window using the registered handler", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    const handler = vi.fn(async () => ({
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresAt: 9_999_999_999_999
    }));
    registry.register("twitter", handler);

    const now = 1_000_000;
    await vault.setOAuth("twitter", {
      accessToken: "old",
      refreshToken: "old-rt",
      expiresAt: now + 1000 // well inside window
    });

    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => now });
    const refreshed = vi.fn();
    scheduler.on("token:refreshed", refreshed);
    const result = await scheduler.tick();
    expect(result.refreshed).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
    expect((await vault.getOAuth("twitter"))?.accessToken).toBe("new-token");
    expect(refreshed).toHaveBeenCalledOnce();
  });

  it("emits token:expired with reason=no-handler when no handler is registered", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    const now = 0;
    await vault.setOAuth("twitter", {
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: now + 1
    });
    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => now });
    const expired = vi.fn();
    scheduler.on("token:expired", expired);
    const r = await scheduler.tick();
    expect(r.expired).toBe(1);
    expect(expired.mock.calls[0][0]).toMatchObject({ platform: "twitter", reason: "no-handler" });
    expect((await vault.getOAuth("twitter"))?.needsReconsent).toBe(true);
  });

  it("emits token:expired with reason=no-refresh-token when refresh token is missing", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    registry.register("twitter", async () => ({ accessToken: "x" }));
    const now = 0;
    await vault.setOAuth("twitter", { accessToken: "old", expiresAt: now + 1 });
    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => now });
    const expired = vi.fn();
    scheduler.on("token:expired", expired);
    await scheduler.tick();
    expect(expired.mock.calls[0][0]).toMatchObject({ reason: "no-refresh-token" });
  });

  it("emits token:expired with reason=handler-error on refresh failure", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    registry.register("twitter", async () => {
      throw new Error("boom");
    });
    const now = 0;
    await vault.setOAuth("twitter", {
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: now + 1
    });
    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => now });
    const expired = vi.fn();
    scheduler.on("token:expired", expired);
    await scheduler.tick();
    expect(expired.mock.calls[0][0]).toMatchObject({
      reason: "handler-error",
      error: "boom"
    });
  });

  it("skips credentials outside the refresh window", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    registry.register("twitter", async () => ({ accessToken: "x" }));
    const now = 0;
    await vault.setOAuth("twitter", {
      accessToken: "old",
      refreshToken: "rt",
      expiresAt: now + DEFAULT_REFRESH_WINDOW_MS * 2
    });
    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => now });
    const r = await scheduler.tick();
    expect(r.refreshed).toBe(0);
    expect(r.expired).toBe(0);
  });

  it("skips credentials that already need reconsent and ones with no expiry", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    await vault.setOAuth("a", {
      accessToken: "x",
      refreshToken: "r",
      expiresAt: 1,
      needsReconsent: true
    });
    await vault.setOAuth("b", { accessToken: "y" });
    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => 0 });
    const r = await scheduler.tick();
    expect(r.refreshed).toBe(0);
    expect(r.expired).toBe(0);
    expect(r.checked).toBe(2);
  });

  it("registry has/get behave correctly", () => {
    const r = new RefreshRegistry();
    expect(r.has("x")).toBe(false);
    r.register("x", async () => ({ accessToken: "t" }));
    expect(r.has("x")).toBe(true);
    expect(typeof r.get("x")).toBe("function");
  });

  it("calls logger.warn with a redacted structured payload on token:expired", async () => {
    const vault = makeVault();
    const registry = new RefreshRegistry();
    const now = 0;
    await vault.setOAuth("twitter", {
      accessToken: "super-secret-access",
      refreshToken: "super-secret-refresh",
      expiresAt: now + 1
    });
    const logger = { warn: vi.fn() };
    const scheduler = new TokenRefreshScheduler(vault, registry, { now: () => now, logger });
    await scheduler.tick();

    expect(logger.warn).toHaveBeenCalledOnce();
    const [payload, message] = logger.warn.mock.calls[0]!;
    expect(payload).toMatchObject({
      event: "token_expired",
      provider: "twitter",
      platform: "twitter",
      expiresAt: now + 1,
      reason: "no-handler"
    });
    expect(message).toMatch(/re-consent required/i);
    // Hard guarantee: never log token values.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("super-secret-access");
    expect(serialized).not.toContain("super-secret-refresh");
  });
});
