import { describe, expect, it, vi } from "vitest";

import {
  TwitterAppNotConfiguredError,
  TwitterOAuthExchanger,
  TwitterPkceMissingError,
  TWITTER_DEFAULT_SCOPES,
  TWITTER_TOKEN_URL,
  type TwitterAppCredentials
} from "./oauth.js";
import type { FetchLike } from "./rest-client.js";

function tokenResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const REDIRECT = "https://app.example.com/oauth/callback/twitter";
const VERIFIER_CTX = { metadata: { codeVerifier: "the-verifier" } };

function makeExchanger(fetchImpl: FetchLike, creds?: TwitterAppCredentials) {
  return new TwitterOAuthExchanger({
    redirectUri: REDIRECT,
    getAppCredentials: async () => creds ?? { clientId: "cid" },
    fetchImpl
  });
}

describe("TwitterOAuthExchanger", () => {
  it("defaults to the read/write + offline scopes (no DM)", () => {
    const exchanger = makeExchanger(vi.fn<FetchLike>(async () => tokenResponse({})));
    expect(exchanger.scopes).toEqual(TWITTER_DEFAULT_SCOPES);
    expect(exchanger.scopes.some((s) => s.startsWith("dm."))).toBe(false);
  });

  it("exchanges a code + PKCE verifier for a token (public client, body client_id)", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      tokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 7200 })
    );
    const token = await makeExchanger(fetchImpl).exchangeCode("auth-code", VERIFIER_CTX);

    expect(token).toEqual({ accessToken: "at", refreshToken: "rt", expiresInSec: 7200 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(TWITTER_TOKEN_URL);
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("redirect_uri")).toBe(REDIRECT);
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("uses HTTP Basic auth for a confidential client and still sends the verifier", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    await makeExchanger(fetchImpl, { clientId: "cid", clientSecret: "shh" }).exchangeCode(
      "c",
      VERIFIER_CTX
    );
    const [, init] = fetchImpl.mock.calls[0]!;
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Basic ${Buffer.from("cid:shh").toString("base64")}`);
    const body = init?.body as URLSearchParams;
    expect(body.get("code_verifier")).toBe("the-verifier");
  });

  it("throws when the PKCE code_verifier is missing from the exchange context", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    await expect(makeExchanger(fetchImpl).exchangeCode("c")).rejects.toBeInstanceOf(
      TwitterPkceMissingError
    );
    await expect(
      makeExchanger(fetchImpl).exchangeCode("c", { metadata: {} })
    ).rejects.toBeInstanceOf(TwitterPkceMissingError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when app credentials are not configured", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    const exchanger = new TwitterOAuthExchanger({
      redirectUri: REDIRECT,
      getAppCredentials: async () => undefined,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("c", VERIFIER_CTX)).rejects.toBeInstanceOf(
      TwitterAppNotConfiguredError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("omits refreshToken/expiresInSec when the response lacks them", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ access_token: "at" }));
    const token = await makeExchanger(fetchImpl).exchangeCode("c", VERIFIER_CTX);
    expect(token).toEqual({ accessToken: "at" });
  });

  it("throws a TwitterApiError on a non-ok token response", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ error: "invalid_grant" }, 400));
    await expect(makeExchanger(fetchImpl).exchangeCode("c", VERIFIER_CTX)).rejects.toMatchObject({
      name: "TwitterApiError",
      httpStatus: 400
    });
  });

  it("throws when the token response has no access_token", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => tokenResponse({ expires_in: 5 }));
    await expect(makeExchanger(fetchImpl).exchangeCode("c", VERIFIER_CTX)).rejects.toThrow(
      /no access_token/
    );
  });

  it("rejects an SSRF-unsafe token URL at construction", () => {
    expect(
      () =>
        new TwitterOAuthExchanger({
          tokenUrl: "http://127.0.0.1/token",
          redirectUri: REDIRECT,
          getAppCredentials: async () => ({ clientId: "c" })
        })
    ).toThrow();
  });
});
