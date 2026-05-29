import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import {
  ConnectorRegistry,
  DlqRepository,
  RateLimitBroker,
  SocialDmSenderRegistry,
  WebhookHandlerRegistry
} from "../../platform/index.js";
import type { MetaAppCredential } from "../../vault/index.js";
import { registerMetaConnectors, type RegisterMetaConnectorsDeps } from "./index.js";

const config = {
  graphBaseUrl: "https://graph.facebook.com/v25.0",
  threadsBaseUrl: "https://graph.threads.net/v25.0",
  oauthCallbackBaseUrl: "https://app.example.com"
};

function buildDeps(
  db: Database,
  overrides: Partial<RegisterMetaConnectorsDeps> = {},
  meta?: MetaAppCredential
): RegisterMetaConnectorsDeps {
  return {
    config,
    registries: {
      oauth: new ConnectorRegistry(),
      webhooks: new WebhookHandlerRegistry(),
      dmSenders: new SocialDmSenderRegistry()
    },
    vault: { getMeta: vi.fn(async () => meta) },
    broker: new RateLimitBroker({ budgets: { meta: { capacity: 10, refillPerSec: 1 } } }),
    dlq: new DlqRepository(db),
    ...overrides
  };
}

describe("registerMetaConnectors", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("registers OAuth exchangers for facebook, instagram, and threads", async () => {
    const deps = buildDeps(db);
    await registerMetaConnectors(deps);
    expect(deps.registries.oauth.get("facebook")).toBeDefined();
    expect(deps.registries.oauth.get("instagram")).toBeDefined();
    expect(deps.registries.oauth.get("threads")).toBeDefined();
  });

  it("registers webhook handlers only when app credentials exist", async () => {
    const withoutApp = buildDeps(db);
    await registerMetaConnectors(withoutApp);
    expect(withoutApp.registries.webhooks.has("instagram")).toBe(false);

    const withApp = buildDeps(db, {}, { appId: "id", appSecret: "secret" });
    await registerMetaConnectors(withApp);
    expect(withApp.registries.webhooks.has("instagram")).toBe(true);
    expect(withApp.registries.webhooks.has("facebook")).toBe(true);
    expect(withApp.registries.webhooks.has("threads")).toBe(true);
  });

  it("registers the IG DM sender only when an account resolver is provided", async () => {
    const without = buildDeps(db);
    await registerMetaConnectors(without);
    expect(without.registries.dmSenders.platforms()).not.toContain("instagram");

    const withResolver = buildDeps(db, {
      getInstagramAccount: vi.fn(async () => ({ igUserId: "ig-1", accessToken: "tok" }))
    });
    await registerMetaConnectors(withResolver);
    expect(withResolver.registries.dmSenders.platforms()).toContain("instagram");
  });

  it("returns the constructed graph clients and dispatcher", async () => {
    const result = await registerMetaConnectors(buildDeps(db));
    expect(result.graphClient).toBeDefined();
    expect(result.threadsClient).toBeDefined();
    expect(result.dispatcher).toBeDefined();
  });

  it("forwards verified webhook events to onWebhookEvent", async () => {
    const onWebhookEvent = vi.fn();
    const deps = buildDeps(db, { onWebhookEvent }, { appId: "id", appSecret: "secret" });
    await registerMetaConnectors(deps);
    const handler = deps.registries.webhooks.get("instagram");
    await handler?.handle({
      platform: "instagram",
      payload: {},
      headers: {},
      rawBody: Buffer.from("{}")
    });
    expect(onWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("wires the vault-backed app-credential resolver into the OAuth exchangers", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: "ll-token", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    );
    const deps = buildDeps(db, { fetchImpl }, { appId: "app-id", appSecret: "app-secret" });
    await registerMetaConnectors(deps);

    const exchanger = deps.registries.oauth.get("facebook");
    const token = await exchanger?.exchangeCode("auth-code");

    expect(token?.accessToken).toBe("ll-token");
    expect(deps.vault.getMeta).toHaveBeenCalled();
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("client_id=app-id");
  });
});
