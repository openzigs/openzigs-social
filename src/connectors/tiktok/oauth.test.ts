import { describe, expect, it, vi } from "vitest";

import type { ConnectorRegistry } from "../../platform/index.js";
import {
  TikTokAppNotConfiguredError,
  TikTokOAuthExchanger,
  TIKTOK_DEFAULT_SCOPES,
  TIKTOK_TOKEN_URL
} from "./oauth.js";
import type { FetchLike } from "./rest-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

const creds = { clientKey: "ck", clientSecret: "cs" };

describe("TikTokOAuthExchanger", () => {
  it("implements the OAuthTokenExchanger port with default scopes", () => {
    const exchanger = new TikTokOAuthExchanger({
      redirectUri: "https://app.example/oauth/callback/tiktok",
      getAppCredentials: async () => creds
    });
    expect(exchanger.platform).toBe("tiktok");
    expect(exchanger.scopes).toEqual([...TIKTOK_DEFAULT_SCOPES]);
    // sanity: a registry accepts it as a valid exchanger
    const registry = { register: vi.fn() } as unknown as ConnectorRegistry;
    registry.register(exchanger);
    expect(registry.register).toHaveBeenCalledWith(exchanger);
  });

  it("exchanges an authorization code with credentials in the form body", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(200, {
        access_token: "at",
        refresh_token: "rt",
        expires_in: 7200,
        open_id: "oid"
      })
    );
    const exchanger = new TikTokOAuthExchanger({
      redirectUri: "https://app.example/oauth/callback/tiktok",
      getAppCredentials: async () => creds,
      fetchImpl
    });

    const token = await exchanger.exchangeCode("the-code");

    expect(token).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSec: 7200 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(TIKTOK_TOKEN_URL);
    const body = (init?.body as URLSearchParams).toString();
    expect(body).toContain("client_key=ck");
    expect(body).toContain("client_secret=cs");
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=the-code");
  });

  it("throws when app credentials are not configured", async () => {
    const exchanger = new TikTokOAuthExchanger({
      redirectUri: "https://app.example/oauth/callback/tiktok",
      getAppCredentials: async () => undefined
    });
    await expect(exchanger.exchangeCode("c")).rejects.toBeInstanceOf(TikTokAppNotConfiguredError);
  });

  it("surfaces a token-endpoint error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(400, { error: "invalid_grant", error_description: "bad code" })
    );
    const exchanger = new TikTokOAuthExchanger({
      redirectUri: "https://app.example/oauth/callback/tiktok",
      getAppCredentials: async () => creds,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("c")).rejects.toMatchObject({ name: "TikTokApiError" });
  });

  it("rejects a token response without an access token", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { open_id: "oid" }));
    const exchanger = new TikTokOAuthExchanger({
      redirectUri: "https://app.example/oauth/callback/tiktok",
      getAppCredentials: async () => creds,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("c")).rejects.toMatchObject({ name: "TikTokApiError" });
  });

  it("rejects an SSRF-unsafe token URL", () => {
    expect(
      () =>
        new TikTokOAuthExchanger({
          tokenUrl: "http://169.254.169.254/token",
          redirectUri: "https://app.example/oauth/callback/tiktok",
          getAppCredentials: async () => creds
        })
    ).toThrow();
  });
});
