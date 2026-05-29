import { describe, expect, it, vi } from "vitest";

import { SETUP_PROVIDERS, validateProviderKey } from "./provider-validator.js";

function okFetch(status = 200): typeof fetch {
  return vi.fn(
    async (_url: string | URL | Request) => new Response(JSON.stringify({ data: [] }), { status })
  ) as unknown as typeof fetch;
}

describe("SETUP_PROVIDERS", () => {
  it("lists the three supported providers", () => {
    expect(SETUP_PROVIDERS).toEqual(["openai", "anthropic", "openai-compatible"]);
  });
});

describe("validateProviderKey", () => {
  it("validates openai against /models with a Bearer header", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.openai.com/v1/models");
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await validateProviderKey({ provider: "openai", apiKey: "sk-test" }, fetchImpl);
    expect(res).toEqual({ valid: true, status: 200 });
  });

  it("validates anthropic with x-api-key and version headers", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.anthropic.com/v1/models");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("ant-test");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await validateProviderKey({ provider: "anthropic", apiKey: "ant-test" }, fetchImpl);
    expect(res.valid).toBe(true);
  });

  it("validates an openai-compatible base URL", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.groq.com/openai/v1/models");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const res = await validateProviderKey(
      { provider: "openai-compatible", apiKey: "k", baseUrl: "https://api.groq.com/openai/v1" },
      fetchImpl
    );
    expect(res.valid).toBe(true);
  });

  it("reports invalid when the provider returns a non-2xx status", async () => {
    const res = await validateProviderKey({ provider: "openai", apiKey: "bad" }, okFetch(401));
    expect(res.valid).toBe(false);
    expect(res.status).toBe(401);
    expect(res.reason).toMatch(/401/);
  });

  it("reports invalid (no throw) when the request fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await validateProviderKey({ provider: "openai", apiKey: "k" }, fetchImpl);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("could not reach provider");
  });

  it("throws when openai-compatible baseUrl is missing", async () => {
    await expect(
      validateProviderKey({ provider: "openai-compatible", apiKey: "k" }, okFetch())
    ).rejects.toThrow(/baseUrl is required/);
  });

  it("throws when openai-compatible baseUrl targets a private host (SSRF guard)", async () => {
    await expect(
      validateProviderKey(
        { provider: "openai-compatible", apiKey: "k", baseUrl: "http://169.254.169.254" },
        okFetch()
      )
    ).rejects.toThrow(/not allowed/);
  });

  it("never includes the key in the result", async () => {
    const res = await validateProviderKey(
      { provider: "openai", apiKey: "sk-SHOULD-NOT-LEAK" },
      okFetch(403)
    );
    expect(JSON.stringify(res)).not.toContain("sk-SHOULD-NOT-LEAK");
  });
});
