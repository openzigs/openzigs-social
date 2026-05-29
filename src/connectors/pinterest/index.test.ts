import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import { ConnectorRegistry, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import type { PinterestAppCredential } from "../../vault/index.js";
import {
  InsightsRepository,
  registerPinterestConnectors,
  type RegisterPinterestConnectorsDeps
} from "./index.js";

const config = {
  apiBaseUrl: "https://api.pinterest.com/v5",
  oauthCallbackBaseUrl: "https://app.example.com"
};

function buildDeps(
  db: Database,
  overrides: Partial<RegisterPinterestConnectorsDeps> = {},
  cred?: PinterestAppCredential
): RegisterPinterestConnectorsDeps {
  return {
    config,
    registries: { oauth: new ConnectorRegistry() },
    vault: { getPinterest: vi.fn(async () => cred) },
    broker: new RateLimitBroker({ budgets: { pinterest: { capacity: 10, refillPerSec: 1 } } }),
    dlq: new DlqRepository(db),
    insights: new InsightsRepository(db),
    ...overrides
  };
}

describe("registerPinterestConnectors", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("registers the Pinterest OAuth exchanger", async () => {
    const deps = buildDeps(db);
    await registerPinterestConnectors(deps);
    expect(deps.registries.oauth.get("pinterest")).toBeDefined();
  });

  it("returns the constructed client, dispatcher, publisher and poller", async () => {
    const result = await registerPinterestConnectors(buildDeps(db));
    expect(result.client).toBeDefined();
    expect(result.dispatcher).toBeDefined();
    expect(result.publisher).toBeDefined();
    expect(result.analyticsPoller).toBeDefined();
  });

  it("works with or without app credentials configured", async () => {
    await expect(registerPinterestConnectors(buildDeps(db))).resolves.toBeDefined();
    await expect(
      registerPinterestConnectors(buildDeps(db, {}, { appId: "a", appSecret: "s" }))
    ).resolves.toBeDefined();
  });
});
