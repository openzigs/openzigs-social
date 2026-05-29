import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "./graph-client.js";
import {
  FacebookOAuthExchanger,
  MetaAppNotConfiguredError,
  ThreadsOAuthExchanger,
  type MetaAppCredentials
} from "./oauth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const app: MetaAppCredentials = { appId: "app-1", appSecret: "shh-secret" };
const getApp = async (): Promise<MetaAppCredentials> => app;

describe("FacebookOAuthExchanger", () => {
  it("exchanges a code for a short-lived token", async () => {
    let url = "";
    const fetchImpl: FetchLike = async (u) => {
      url = u;
      return jsonResponse({ access_token: "short-tok", token_type: "bearer", expires_in: 3600 });
    };
    const exchanger = new FacebookOAuthExchanger({
      platform: "facebook",
      tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      redirectUri: "https://app.local/oauth/callback/facebook",
      getAppCredentials: getApp,
      fetchImpl
    });

    const token = await exchanger.exchangeCode("auth-code");
    expect(token).toEqual({ accessToken: "short-tok", expiresInSec: 3600 });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("client_id")).toBe("app-1");
    expect(parsed.searchParams.get("client_secret")).toBe("shh-secret");
    expect(parsed.searchParams.get("code")).toBe("auth-code");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.local/oauth/callback/facebook"
    );
  });

  it("upgrades to a long-lived token when configured", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (u) => {
      calls.push(u);
      if (u.includes("fb_exchange_token")) {
        return jsonResponse({ access_token: "long-tok", expires_in: 5_184_000 });
      }
      return jsonResponse({ access_token: "short-tok", expires_in: 3600 });
    };
    const exchanger = new FacebookOAuthExchanger({
      platform: "instagram",
      tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      longLivedUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      redirectUri: "https://app.local/oauth/callback/instagram",
      getAppCredentials: getApp,
      fetchImpl
    });

    const token = await exchanger.exchangeCode("code");
    expect(token).toEqual({ accessToken: "long-tok", expiresInSec: 5_184_000 });
    expect(calls).toHaveLength(2);
    expect(new URL(calls[1]).searchParams.get("fb_exchange_token")).toBe("short-tok");
  });

  it("lowercases the platform key", () => {
    const exchanger = new FacebookOAuthExchanger({
      platform: "FaceBook",
      tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      redirectUri: "https://app.local/cb",
      getAppCredentials: getApp
    });
    expect(exchanger.platform).toBe("facebook");
  });

  it("throws MetaAppNotConfiguredError when credentials are absent", async () => {
    const exchanger = new FacebookOAuthExchanger({
      platform: "facebook",
      tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      redirectUri: "https://app.local/cb",
      getAppCredentials: async () => undefined,
      fetchImpl: async () => jsonResponse({})
    });
    await expect(exchanger.exchangeCode("code")).rejects.toBeInstanceOf(MetaAppNotConfiguredError);
  });

  it("rejects an unsafe token URL at construction", () => {
    expect(
      () =>
        new FacebookOAuthExchanger({
          platform: "facebook",
          tokenUrl: "http://127.0.0.1/oauth/access_token",
          redirectUri: "https://app.local/cb",
          getAppCredentials: getApp
        })
    ).toThrow();
  });

  it("throws a MetaGraphError on an error envelope", async () => {
    const fetchImpl: FetchLike = async () =>
      jsonResponse({ error: { message: "bad code", code: 100 } }, 400);
    const exchanger = new FacebookOAuthExchanger({
      platform: "facebook",
      tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      redirectUri: "https://app.local/cb",
      getAppCredentials: getApp,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("code")).rejects.toMatchObject({
      name: "MetaGraphError",
      httpStatus: 400
    });
  });

  it("throws when the response has no access_token", async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ token_type: "bearer" });
    const exchanger = new FacebookOAuthExchanger({
      platform: "facebook",
      tokenUrl: "https://graph.facebook.com/v25.0/oauth/access_token",
      redirectUri: "https://app.local/cb",
      getAppCredentials: getApp,
      fetchImpl
    });
    await expect(exchanger.exchangeCode("code")).rejects.toMatchObject({
      message: "token exchange returned no access_token"
    });
  });
});

describe("ThreadsOAuthExchanger", () => {
  it("POSTs a form to exchange the code", async () => {
    let init: RequestInit | undefined;
    const fetchImpl: FetchLike = async (_u, i) => {
      init = i;
      return jsonResponse({ access_token: "th-short", user_id: "999" });
    };
    const exchanger = new ThreadsOAuthExchanger({
      tokenUrl: "https://graph.threads.net/v25.0/oauth/access_token",
      redirectUri: "https://app.local/oauth/callback/threads",
      getAppCredentials: getApp,
      fetchImpl
    });

    const token = await exchanger.exchangeCode("th-code");
    expect(token).toEqual({ accessToken: "th-short" });
    expect(exchanger.platform).toBe("threads");
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("shh-secret");
    expect(body.get("code")).toBe("th-code");
  });

  it("upgrades to a long-lived token via th_exchange_token", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (u) => {
      calls.push(u);
      if (u.includes("th_exchange_token")) {
        return jsonResponse({ access_token: "th-long", expires_in: 5_184_000 });
      }
      return jsonResponse({ access_token: "th-short", user_id: "1" });
    };
    const exchanger = new ThreadsOAuthExchanger({
      tokenUrl: "https://graph.threads.net/v25.0/oauth/access_token",
      longLivedUrl: "https://graph.threads.net/v25.0/access_token",
      redirectUri: "https://app.local/oauth/callback/threads",
      getAppCredentials: getApp,
      fetchImpl
    });

    const token = await exchanger.exchangeCode("code");
    expect(token).toEqual({ accessToken: "th-long", expiresInSec: 5_184_000 });
    expect(new URL(calls[1]).searchParams.get("access_token")).toBe("th-short");
  });

  it("throws MetaAppNotConfiguredError when credentials are absent", async () => {
    const exchanger = new ThreadsOAuthExchanger({
      tokenUrl: "https://graph.threads.net/v25.0/oauth/access_token",
      redirectUri: "https://app.local/cb",
      getAppCredentials: async () => undefined
    });
    await expect(exchanger.exchangeCode("code")).rejects.toBeInstanceOf(MetaAppNotConfiguredError);
  });

  it("defaults to global fetch when none injected", () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));
    const exchanger = new ThreadsOAuthExchanger({
      tokenUrl: "https://graph.threads.net/v25.0/oauth/access_token",
      redirectUri: "https://app.local/cb",
      getAppCredentials: getApp
    });
    expect(exchanger).toBeInstanceOf(ThreadsOAuthExchanger);
    spy.mockRestore();
  });
});
