import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialVault } from "../../vault/index.js";
import { OAuthStateStore } from "../../platform/oauth/state-store.js";
import { createSocialSetupRouter } from "./router.js";

function makeVault(): CredentialVault {
  const dir = mkdtempSync(join(tmpdir(), "ozs-social-"));
  return new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "test-key" });
}

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("social setup router", () => {
  let server: Server;
  let base: string;
  let vault: CredentialVault;
  let stateStore: OAuthStateStore;

  async function mount(): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/social-setup",
      createSocialSetupRouter({ vault, stateStore, publicBaseUrl: "http://localhost:3000" })
    );
    ({ server, base } = await listen(app));
  }

  beforeEach(() => {
    vault = makeVault();
    stateStore = new OAuthStateStore();
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("GET /status", () => {
    it("lists all platforms with redirect URIs and unconfigured state", async () => {
      await mount();
      const res = await fetch(`${base}/api/social-setup/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.platforms).toHaveLength(7);
      const fb = body.platforms.find((p: any) => p.platform === "facebook");
      expect(fb.appConfigured).toBe(false);
      expect(fb.connected).toBe(false);
      expect(fb.redirectUri).toBe("http://localhost:3000/oauth/callback/facebook");
      expect(fb.scopes.length).toBeGreaterThan(0);
    });

    it("reflects configured apps and live connections", async () => {
      await vault.setMeta({ appId: "meta-1", appSecret: "s" });
      await vault.setOAuth("facebook", { accessToken: "tok" });
      await mount();
      const res = await fetch(`${base}/api/social-setup/status`);
      const body = (await res.json()) as Record<string, any>;
      const fb = body.platforms.find((p: any) => p.platform === "facebook");
      expect(fb.appConfigured).toBe(true);
      expect(fb.connected).toBe(true);
      // No secret material in the status payload.
      expect(JSON.stringify(body)).not.toContain("appSecret");
      expect(JSON.stringify(body)).not.toContain("accessToken");
    });
  });

  describe("POST /:platform/authorize", () => {
    it("builds an authorize URL and issues a consumable state", async () => {
      await vault.setMeta({ appId: "meta-1", appSecret: "s" });
      await mount();
      const res = await fetch(`${base}/api/social-setup/instagram/authorize`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.url).toContain("client_id=meta-1");
      expect(body.url).toContain(`state=${body.state}`);
      expect(body.redirectUri).toBe("http://localhost:3000/oauth/callback/instagram");
      // The minted state is valid for the same platform.
      expect(stateStore.consume("instagram", body.state)).toBeDefined();
    });

    it("returns 409 when the app is not configured", async () => {
      await mount();
      const res = await fetch(`${base}/api/social-setup/facebook/authorize`, { method: "POST" });
      expect(res.status).toBe(409);
    });

    it("returns 404 for an unknown platform", async () => {
      await mount();
      const res = await fetch(`${base}/api/social-setup/myspace/authorize`, { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /meta/app", () => {
    it("stores the Meta app and returns scopes + redirect URIs without the secret", async () => {
      await mount();
      const res = await fetch(`${base}/api/social-setup/meta/app`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: "app-123", appSecret: "super-secret" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.stored).toBe(true);
      expect(body.appId).toBe("app-123");
      expect(body.scopes).toContain("instagram_content_publish");
      expect(body.redirectUris.map((r: any) => r.platform)).toEqual([
        "instagram",
        "facebook",
        "threads"
      ]);
      expect(JSON.stringify(body)).not.toContain("super-secret");
      expect((await vault.getMeta())?.appSecret).toBe("super-secret");
    });

    it("rejects a missing app secret with 400", async () => {
      await mount();
      const res = await fetch(`${base}/api/social-setup/meta/app`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: "app-123" })
      });
      expect(res.status).toBe(400);
    });
  });
});
