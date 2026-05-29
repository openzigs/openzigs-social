import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { ConnectorRegistry, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import type { TikTokAppCredential } from "../../vault/index.js";
import {
  InsightsRepository,
  registerTikTokConnectors,
  type RegisterTikTokConnectorsDeps
} from "./index.js";

const config = {
  apiBaseUrl: "https://open.tiktokapis.com/v2",
  oauthCallbackBaseUrl: "https://app.example.com"
};

function buildDeps(
  db: Database,
  overrides: Partial<RegisterTikTokConnectorsDeps> = {},
  cred?: TikTokAppCredential
): RegisterTikTokConnectorsDeps {
  return {
    config,
    registries: { oauth: new ConnectorRegistry() },
    vault: { getTikTok: vi.fn(async () => cred) },
    broker: new RateLimitBroker({ budgets: { tiktok: { capacity: 10, refillPerSec: 1 } } }),
    dlq: new DlqRepository(db),
    insights: new InsightsRepository(db),
    ...overrides
  };
}

describe("registerTikTokConnectors", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("registers the TikTok OAuth exchanger", async () => {
    const deps = buildDeps(db);
    await registerTikTokConnectors(deps);
    expect(deps.registries.oauth.get("tiktok")).toBeDefined();
  });

  it("returns the constructed client, dispatcher, publisher and display poller", async () => {
    const result = await registerTikTokConnectors(buildDeps(db));
    expect(result.client).toBeDefined();
    expect(result.dispatcher).toBeDefined();
    expect(result.publisher).toBeDefined();
    expect(result.displayPoller).toBeDefined();
  });

  it("works with or without app credentials configured", async () => {
    await expect(registerTikTokConnectors(buildDeps(db))).resolves.toBeDefined();
    await expect(
      registerTikTokConnectors(buildDeps(db, {}, { clientKey: "ck", clientSecret: "cs" }))
    ).resolves.toBeDefined();
  });
});
