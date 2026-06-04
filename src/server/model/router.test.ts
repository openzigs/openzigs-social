import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialVault } from "../../vault/index.js";
import type { OllamaProbeResult } from "../../copilot/providers/ollama.js";
import { ModelSelectionStore } from "./selection-store.js";
import { createModelRouter, type ModelRouterDeps } from "./router.js";

function makeVault(): CredentialVault {
  const dir = mkdtempSync(join(tmpdir(), "ozs-model-vault-"));
  return new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "test-key" });
}

function makeStore(): ModelSelectionStore {
  const dir = mkdtempSync(join(tmpdir(), "ozs-model-store-"));
  return new ModelSelectionStore({ filePath: join(dir, "model.json") });
}

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function reachableProbe(installed?: string): OllamaProbeResult {
  return {
    reachable: true,
    ...(installed ? { installedVariant: installed } : {}),
    tags: {
      models: [{ name: "gemma4:e4b" }, { name: "llama3:8b" }, { name: "gemma4:e4b" }]
    }
  };
}

describe("model router", () => {
  let server: Server;
  let base: string;
  let vault: CredentialVault;
  let selection: ModelSelectionStore;

  async function mount(overrides: Partial<ModelRouterDeps> = {}): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use(
      "/api/model",
      createModelRouter({
        vault,
        selection,
        recommendVariant: () => "gemma4:e4b",
        probe: vi.fn(async () => reachableProbe("gemma4:e4b")),
        ...overrides
      })
    );
    ({ server, base } = await listen(app));
  }

  beforeEach(() => {
    vault = makeVault();
    selection = makeStore();
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("GET /status", () => {
    it("reports a reachable Ollama with deduped models and recommendation", async () => {
      await mount();
      const res = await fetch(`${base}/api/model/status`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.ollama.reachable).toBe(true);
      expect(body.ollama.installedVariant).toBe("gemma4:e4b");
      expect(body.ollama.recommendedVariant).toBe("gemma4:e4b");
      expect(body.ollama.models).toEqual(["gemma4:e4b", "llama3:8b"]);
      expect(body.ollama.variants).toEqual(["gemma4:12b", "gemma4:e4b", "gemma4:e2b"]);
      expect(body.source).toBe("local");
      expect(body.providers.map((p: any) => p.id)).toEqual([
        "openai",
        "anthropic",
        "openai-compatible"
      ]);
      expect(body.providers.every((p: any) => p.configured === false)).toBe(true);
      expect(body.selection).toBeNull();
    });

    it("flags configured BYOK providers and defaults to byok when unreachable", async () => {
      await vault.setProvider("openai", { apiKey: "sk-xyz" });
      await mount({ probe: vi.fn(async () => ({ reachable: false })) });
      const res = await fetch(`${base}/api/model/status`);
      const body = (await res.json()) as Record<string, any>;
      expect(body.ollama.reachable).toBe(false);
      expect(body.ollama.installedVariant).toBeNull();
      expect(body.source).toBe("byok");
      const openai = body.providers.find((p: any) => p.id === "openai");
      expect(openai.configured).toBe(true);
      expect(body.widgets.byokCredit.available).toBe(true);
      expect(JSON.stringify(body)).not.toContain("sk-xyz");
    });

    it("reflects a persisted BYOK selection as the source", async () => {
      await vault.setProvider("anthropic", { apiKey: "sk-a" });
      await selection.set({ provider: "anthropic" });
      await mount();
      const res = await fetch(`${base}/api/model/status`);
      const body = (await res.json()) as Record<string, any>;
      expect(body.source).toBe("byok");
      expect(body.selection).toEqual({ provider: "anthropic" });
    });

    it("returns 500 when the probe throws", async () => {
      await mount({
        probe: vi.fn(async () => {
          throw new Error("boom");
        })
      });
      const res = await fetch(`${base}/api/model/status`);
      expect(res.status).toBe(500);
    });
  });

  describe("POST /select", () => {
    it("persists a local selection with a model", async () => {
      await mount();
      const res = await fetch(`${base}/api/model/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "local", model: "gemma4:12b" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body).toEqual({
        selected: true,
        selection: { provider: "local", model: "gemma4:12b" }
      });
      expect(await selection.get()).toEqual({ provider: "local", model: "gemma4:12b" });
    });

    it("rejects a local selection without a model (400)", async () => {
      await mount();
      const res = await fetch(`${base}/api/model/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "local" })
      });
      expect(res.status).toBe(400);
    });

    it("rejects a BYOK selection for an unconfigured provider (409)", async () => {
      await mount();
      const res = await fetch(`${base}/api/model/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai" })
      });
      expect(res.status).toBe(409);
    });

    it("accepts a BYOK selection for a configured provider", async () => {
      await vault.setProvider("openai", { apiKey: "sk-ok" });
      await mount();
      const res = await fetch(`${base}/api/model/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openai" })
      });
      expect(res.status).toBe(200);
      expect(await selection.get()).toEqual({ provider: "openai" });
    });

    it("rejects an unknown provider at the boundary (400)", async () => {
      await mount();
      const res = await fetch(`${base}/api/model/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "evil" })
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /pull", () => {
    it("proxies a pull to Ollama and returns status", async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ status: "success" }), { status: 200 })
      ) as unknown as typeof fetch;
      await mount({ fetchImpl });
      const res = await fetch(`${base}/api/model/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gemma4:e4b" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body).toEqual({ pulling: true, model: "gemma4:e4b", status: "success" });
      expect(fetchImpl).toHaveBeenCalledWith(
        "http://localhost:11434/api/pull",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("rejects an invalid model tag (400)", async () => {
      const fetchImpl = vi.fn() as unknown as typeof fetch;
      await mount({ fetchImpl });
      const res = await fetch(`${base}/api/model/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "evil; rm -rf /" })
      });
      expect(res.status).toBe(400);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns 502 when Ollama is unreachable", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch;
      await mount({ fetchImpl });
      const res = await fetch(`${base}/api/model/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gemma4:e2b" })
      });
      expect(res.status).toBe(502);
    });

    it("returns 502 when Ollama responds with an error", async () => {
      const fetchImpl = vi.fn(
        async () => new Response("nope", { status: 500 })
      ) as unknown as typeof fetch;
      await mount({ fetchImpl });
      const res = await fetch(`${base}/api/model/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "gemma4:e2b" })
      });
      expect(res.status).toBe(502);
    });

    it("rejects a missing model (400)", async () => {
      await mount();
      const res = await fetch(`${base}/api/model/pull`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });
  });
});
