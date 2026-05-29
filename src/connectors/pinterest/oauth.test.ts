import { describe, expect, it, vi } from "vitest";

import {
  PinterestAppNotConfiguredError,
  PinterestOAuthExchanger,
  PINTEREST_DEFAULT_SCOPES,
  PINTEREST_TOKEN_URL,
  type PinterestAppCredentials
} from "./oauth.js";
import type { FetchLike } from "./rest-client.js";

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const creds: PinterestAppCredentials = { appId: "app", appSecret: "secret" };

function makeExchanger(fetchImpl: FetchLike) {
  return new PinterestOAuthExchanger({
    redirectUri: "https://app.example.com/oauth/callback/pinterest",
    getAppCredentials: async () => creds,
    fetchImpl
  });
}

describe("PinterestOAuthExchanger", () => {
  it("exposes default read/write pin + board scopes", () => {
    const exchanger = makeExchanger(vi.fn<FetchLike>(async () => tokenResponse({})));
    expect(exchanger.scopes).toEqual(PINTEREST_DEFAULT_SCOPES);
  });

  it("exchanges a code using HTTP Basic auth and a form body", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      tokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 })
    );
    const token = await makeExchanger(fetchImpl).exchangeCode("the-code");

    expect(token).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSec: 3600 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(PINTEREST_TOKEN_URL);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("app:secret").toString("base64")}`);
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("redirect_uri")).toBe("https://app.example.com/oauth/callback/pinterest");
  });

  it("omits optional token fields when absent", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    expect(await makeExchanger(fetchImpl).exchangeCode("c")).toEqual({ accessToken: "at" });
  });

  it("throws when app credentials are missing", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    const exchanger = new PinterestOAuthExchanger({
      redirectUri: "https://app.example.com/oauth/callback/pinterest",
      getAppCredentials: async () => undefined,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("c")).rejects.toBeInstanceOf(
      PinterestAppNotConfiguredError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ message: "no" }, 400));
    await expect(makeExchanger(fetchImpl).exchangeCode("c")).rejects.toMatchObject({
      name: "PinterestApiError",
      httpStatus: 400
    });
  });

  it("throws when no access_token is returned", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ expires_in: 1 }));
    await expect(makeExchanger(fetchImpl).exchangeCode("c")).rejects.toThrow(/no access_token/);
  });

  it("rejects an SSRF-unsafe token URL", () => {
    expect(
      () =>
        new PinterestOAuthExchanger({
          tokenUrl: "http://127.0.0.1/token",
          redirectUri: "https://app.example.com/oauth/callback/pinterest",
          getAppCredentials: async () => creds,
          fetchImpl: vi.fn<FetchLike>(async () => tokenResponse({}))
        })
    ).toThrow();
  });
});
