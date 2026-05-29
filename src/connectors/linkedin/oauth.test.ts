import { describe, expect, it, vi } from "vitest";

import {
  assertNoDmScopes,
  LinkedInAppNotConfiguredError,
  LinkedInDmScopeError,
  LinkedInOAuthExchanger,
  LINKEDIN_DEFAULT_SCOPES,
  LINKEDIN_FORBIDDEN_DM_SCOPES,
  LINKEDIN_TOKEN_URL,
  type LinkedInAppCredentials
} from "./oauth.js";
import type { FetchLike } from "./rest-client.js";

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const creds: LinkedInAppCredentials = { clientId: "cid", clientSecret: "secret" };

function makeExchanger(fetchImpl: FetchLike, scopes?: readonly string[]) {
  return new LinkedInOAuthExchanger({
    redirectUri: "https://app.example.com/oauth/callback/linkedin",
    getAppCredentials: async () => creds,
    fetchImpl,
    ...(scopes ? { scopes } : {})
  });
}

describe("assertNoDmScopes", () => {
  it("accepts the default comment + post scopes", () => {
    expect(() => assertNoDmScopes(LINKEDIN_DEFAULT_SCOPES)).not.toThrow();
  });

  it.each(LINKEDIN_FORBIDDEN_DM_SCOPES)("rejects forbidden DM scope %s", (scope) => {
    expect(() => assertNoDmScopes([scope])).toThrow(LinkedInDmScopeError);
  });

  it("rejects any scope containing a messaging/dma token (fail closed)", () => {
    expect(() => assertNoDmScopes(["w_member_social", "r_some_messaging_thing"])).toThrow(
      LinkedInDmScopeError
    );
    expect(() => assertNoDmScopes(["x_dma_export"])).toThrow(LinkedInDmScopeError);
  });

  it("is case-insensitive and trims", () => {
    expect(() => assertNoDmScopes([" R_MESSAGES "])).toThrow(LinkedInDmScopeError);
  });
});

describe("LinkedInOAuthExchanger", () => {
  it("refuses to construct with a DM scope", () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({}));
    expect(() => makeExchanger(fetchImpl, ["w_member_social", "r_messages"])).toThrow(
      LinkedInDmScopeError
    );
  });

  it("defaults to comment + post scopes only (no DM)", () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({}));
    const exchanger = makeExchanger(fetchImpl);
    expect(exchanger.scopes).toEqual(LINKEDIN_DEFAULT_SCOPES);
    expect(exchanger.scopes.some((s) => s.includes("messag"))).toBe(false);
  });

  it("exchanges a code for a token via the form endpoint", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      tokenResponse({ access_token: "at", expires_in: 5184000, refresh_token: "rt" })
    );
    const exchanger = makeExchanger(fetchImpl);

    const token = await exchanger.exchangeCode("the-code");

    expect(token).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSec: 5184000 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(LINKEDIN_TOKEN_URL);
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("secret");
    expect(body.get("redirect_uri")).toBe("https://app.example.com/oauth/callback/linkedin");
  });

  it("omits refreshToken/expiresInSec when absent", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    const token = await makeExchanger(fetchImpl).exchangeCode("c");
    expect(token).toEqual({ accessToken: "at" });
  });

  it("throws when app credentials are not configured", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    const exchanger = new LinkedInOAuthExchanger({
      redirectUri: "https://app.example.com/oauth/callback/linkedin",
      getAppCredentials: async () => undefined,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("c")).rejects.toBeInstanceOf(LinkedInAppNotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a non-ok token response", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ error: "invalid_grant" }, 400));
    await expect(makeExchanger(fetchImpl).exchangeCode("c")).rejects.toMatchObject({
      name: "LinkedInApiError",
      httpStatus: 400
    });
  });

  it("throws when the response has no access_token", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ expires_in: 10 }));
    await expect(makeExchanger(fetchImpl).exchangeCode("c")).rejects.toThrow(/no access_token/);
  });

  it("rejects an SSRF-unsafe token URL", () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({}));
    expect(
      () =>
        new LinkedInOAuthExchanger({
          tokenUrl: "http://169.254.169.254/token",
          redirectUri: "https://app.example.com/oauth/callback/linkedin",
          getAppCredentials: async () => creds,
          fetchImpl
        })
    ).toThrow();
  });
});
