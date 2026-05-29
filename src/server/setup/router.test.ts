import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialVault } from "../../vault/index.js";
import { createSetupRouter } from "./router.js";

function makeVault(): { vault: CredentialVault; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "ozs-setup-"));
  const path = join(dir, "auth.json");
  return { vault: new CredentialVault({ filePath: path, keyMaterial: "test-key" }), path };
}

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function jsonOk(): typeof fetch {
  return vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
}

describe("setup router", () => {
  let server: Server;
  let base: string;
  let ctx: ReturnType<typeof makeVault>;

  async function mount(deps: Parameters<typeof createSetupRouter>[0]): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use("/api/setup", createSetupRouter(deps));
    ({ server, base } = await listen(app));
  }

  beforeEach(() => {
    ctx = makeVault();
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("POST /validate-key", () => {
    it("validates and stores a provider key, never echoing it", async () => {
      await mount({ vault: ctx.vault, fetchImpl: jsonOk() });
      const res = await fetch(`${base}/api/setup/validate-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai", apiKey: "sk-SECRET", model: "gpt-4o" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ valid: true, provider: "openai", stored: true });
      expect(JSON.stringify(body)).not.toContain("sk-SECRET");

      // Persisted in the vault at 0o600.
      expect((await ctx.vault.getProvider("openai"))?.apiKey).toBe("sk-SECRET");
      expect(statSync(ctx.path).mode & 0o777).toBe(0o600);
    });

    it("returns valid:false (200) for a rejected key and does not store it", async () => {
      const fetchImpl = vi.fn(
        async () => new Response("{}", { status: 401 })
      ) as unknown as typeof fetch;
      await mount({ vault: ctx.vault, fetchImpl });
      const res = await fetch(`${base}/api/setup/validate-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai", apiKey: "bad" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.valid).toBe(false);
      expect(await ctx.vault.getProvider("openai")).toBeUndefined();
    });

    it("rejects an unknown provider at the boundary with 400", async () => {
      await mount({ vault: ctx.vault, fetchImpl: jsonOk() });
      const res = await fetch(`${base}/api/setup/validate-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "evilcorp", apiKey: "k" })
      });
      expect(res.status).toBe(400);
    });

    it("rejects a missing apiKey with 400", async () => {
      await mount({ vault: ctx.vault, fetchImpl: jsonOk() });
      const res = await fetch(`${base}/api/setup/validate-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai" })
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 when an openai-compatible baseUrl is a private host (SSRF)", async () => {
      await mount({ vault: ctx.vault, fetchImpl: jsonOk() });
      const res = await fetch(`${base}/api/setup/validate-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openai-compatible",
          apiKey: "k",
          baseUrl: "http://10.0.0.5/v1"
        })
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(String(body.error)).toMatch(/not allowed/);
    });

    it("returns 500 when the vault write fails", async () => {
      const boom = {
        load: async () => ({ version: 1, providers: {}, oauth: {} }),
        setProvider: async () => {
          throw new Error("disk full");
        }
      } as unknown as CredentialVault;
      await mount({ vault: boom, fetchImpl: jsonOk() });
      const res = await fetch(`${base}/api/setup/validate-key`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai", apiKey: "k" })
      });
      expect(res.status).toBe(500);
    });
  });

  describe("POST /telegram/verify", () => {
    it("verifies, stores token + chat id, and returns the bot username", async () => {
      const fetchImpl = vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes("/getMe")) {
          return new Response(JSON.stringify({ ok: true, result: { username: "my_bot" } }), {
            status: 200
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as unknown as typeof fetch;
      await mount({ vault: ctx.vault, fetchImpl });
      const res = await fetch(`${base}/api/setup/telegram/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken: "123:SECRET", adminChatId: "555" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ valid: true, stored: true, botUsername: "my_bot" });
      expect(JSON.stringify(body)).not.toContain("SECRET");
      expect((await ctx.vault.getTelegram())?.botToken).toBe("123:SECRET");
    });

    it("returns valid:false (200) and stores nothing when verification fails", async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ ok: false }), { status: 401 })
      ) as unknown as typeof fetch;
      await mount({ vault: ctx.vault, fetchImpl });
      const res = await fetch(`${base}/api/setup/telegram/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken: "bad", adminChatId: "5" })
      });
      expect(res.status).toBe(200);
      expect((await res.json()).valid).toBe(false);
      expect(await ctx.vault.getTelegram()).toBeUndefined();
    });

    it("rejects a non-numeric chat id at the boundary with 400", async () => {
      await mount({ vault: ctx.vault, fetchImpl: jsonOk() });
      const res = await fetch(`${base}/api/setup/telegram/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken: "123:abc", adminChatId: "not-a-number" })
      });
      expect(res.status).toBe(400);
    });

    it("accepts a negative (group) chat id", async () => {
      const fetchImpl = vi.fn(async (url: string | URL | Request) =>
        String(url).includes("/getMe")
          ? new Response(JSON.stringify({ ok: true, result: { username: "b" } }), { status: 200 })
          : new Response(JSON.stringify({ ok: true }), { status: 200 })
      ) as unknown as typeof fetch;
      await mount({ vault: ctx.vault, fetchImpl });
      const res = await fetch(`${base}/api/setup/telegram/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken: "123:abc", adminChatId: "-1001234" })
      });
      expect(res.status).toBe(200);
      expect((await res.json()).valid).toBe(true);
    });

    it("returns 500 when the vault write fails", async () => {
      const fetchImpl = vi.fn(async (url: string | URL | Request) =>
        String(url).includes("/getMe")
          ? new Response(JSON.stringify({ ok: true, result: { username: "b" } }), { status: 200 })
          : new Response(JSON.stringify({ ok: true }), { status: 200 })
      ) as unknown as typeof fetch;
      const boom = {
        setTelegram: async () => {
          throw new Error("disk full");
        }
      } as unknown as CredentialVault;
      await mount({ vault: boom, fetchImpl });
      const res = await fetch(`${base}/api/setup/telegram/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ botToken: "123:abc", adminChatId: "5" })
      });
      expect(res.status).toBe(500);
    });
  });

  describe("GET /status", () => {
    it("reports incomplete on a fresh vault", async () => {
      await mount({ vault: ctx.vault });
      const res = await fetch(`${base}/api/setup/status`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        complete: false,
        hasProvider: false,
        hasTelegram: false
      });
    });

    it("reports complete once a provider and telegram are stored", async () => {
      await ctx.vault.setProvider("openai", { apiKey: "k" });
      await ctx.vault.setTelegram({ botToken: "123:abc", adminChatId: "5" });
      await mount({ vault: ctx.vault });
      const res = await fetch(`${base}/api/setup/status`);
      expect(await res.json()).toEqual({
        complete: true,
        hasProvider: true,
        hasTelegram: true
      });
    });

    it("returns 500 when the vault load fails", async () => {
      const boom = {
        load: async () => {
          throw new Error("corrupt");
        }
      } as unknown as CredentialVault;
      await mount({ vault: boom });
      const res = await fetch(`${base}/api/setup/status`);
      expect(res.status).toBe(500);
    });
  });
});
