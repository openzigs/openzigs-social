import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

import express, { type Express } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OAuthCredential } from "../../vault/index.js";
import { ConnectorRegistry, type OAuthTokenExchanger } from "./connector-registry.js";
import { createOAuthRouter, type OAuthVault } from "./router.js";
import { OAuthStateStore } from "./state-store.js";

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function fakeVault(): { vault: OAuthVault; stored: Record<string, OAuthCredential> } {
  const stored: Record<string, OAuthCredential> = {};
  return {
    stored,
    vault: {
      setOAuth: async (platform, cred) => {
        stored[platform] = cred;
      }
    }
  };
}

function okExchanger(
  platform: string,
  token: Partial<OAuthCredential> & { expiresInSec?: number } = {}
): OAuthTokenExchanger {
  return {
    platform,
    exchangeCode: async (code) => {
      expect(code).toBeTruthy();
      return {
        accessToken: token.accessToken ?? "access-123",
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        expiresInSec: token.expiresInSec
      };
    }
  };
}

describe("oauth router", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function mount(deps: Parameters<typeof createOAuthRouter>[0]): Promise<string> {
    const app = express();
    app.use("/oauth", createOAuthRouter(deps));
    const r = await listen(app);
    server = r.server;
    return r.base;
  }

  it("completes a valid callback, stores tokens, and redirects", async () => {
    const registry = new ConnectorRegistry();
    registry.register(okExchanger("instagram", { refreshToken: "r", expiresInSec: 3600 }));
    const stateStore = new OAuthStateStore({ now: () => 10_000 });
    const { vault, stored } = fakeVault();
    const base = await mount({ registry, stateStore, vault, now: () => 10_000 });

    const state = stateStore.issue("instagram");
    const res = await fetch(
      `${base}/oauth/callback/instagram?state=${encodeURIComponent(state)}&code=abc`,
      { redirect: "manual" }
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?connected=instagram");
    expect(stored.instagram).toEqual({
      accessToken: "access-123",
      refreshToken: "r",
      expiresAt: 10_000 + 3600 * 1000
    });
  });

  it("returns 404 for an unknown platform without leaking internals", async () => {
    const base = await mount({
      registry: new ConnectorRegistry(),
      stateStore: new OAuthStateStore(),
      vault: fakeVault().vault
    });
    const res = await fetch(`${base}/oauth/callback/nope?state=x&code=y`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown platform" });
  });

  it("returns 400 for a missing/invalid state (CSRF protection)", async () => {
    const registry = new ConnectorRegistry();
    registry.register(okExchanger("x"));
    const base = await mount({
      registry,
      stateStore: new OAuthStateStore(),
      vault: fakeVault().vault
    });
    const res = await fetch(`${base}/oauth/callback/x?code=y`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid or expired state" });
  });

  it("rejects a replayed state", async () => {
    const registry = new ConnectorRegistry();
    registry.register(okExchanger("x"));
    const stateStore = new OAuthStateStore();
    const base = await mount({ registry, stateStore, vault: fakeVault().vault });
    const state = stateStore.issue("x");
    const first = await fetch(`${base}/oauth/callback/x?state=${state}&code=y`, {
      redirect: "manual"
    });
    expect(first.status).toBe(302);
    const replay = await fetch(`${base}/oauth/callback/x?state=${state}&code=y`);
    expect(replay.status).toBe(400);
  });

  it("returns 400 when the authorization code is missing", async () => {
    const registry = new ConnectorRegistry();
    registry.register(okExchanger("x"));
    const stateStore = new OAuthStateStore();
    const base = await mount({ registry, stateStore, vault: fakeVault().vault });
    const state = stateStore.issue("x");
    const res = await fetch(`${base}/oauth/callback/x?state=${state}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing authorization code" });
  });

  it("returns 502 when token exchange fails (no internals leaked)", async () => {
    const registry = new ConnectorRegistry();
    registry.register({
      platform: "x",
      exchangeCode: async () => {
        throw new Error("boom secret detail");
      }
    });
    const stateStore = new OAuthStateStore();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const base = await mount({ registry, stateStore, vault: fakeVault().vault, logger });
    const state = stateStore.issue("x");
    const res = await fetch(`${base}/oauth/callback/x?state=${state}&code=y`);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "token exchange failed" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("honours a safe success redirect and ignores an unsafe one", async () => {
    const registry = new ConnectorRegistry();
    registry.register(okExchanger("x"));
    const stateStore = new OAuthStateStore();
    const base = await mount({
      registry,
      stateStore,
      vault: fakeVault().vault,
      successRedirect: "//evil.com"
    });
    const state = stateStore.issue("x");
    const res = await fetch(`${base}/oauth/callback/x?state=${state}&code=y`, {
      redirect: "manual"
    });
    expect(res.headers.get("location")).toBe("/?connected=x");
  });
});
