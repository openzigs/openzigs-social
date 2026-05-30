import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import {
  ConnectorRegistry,
  DlqRepository,
  RateLimitBroker,
  SocialBrainRepository,
  SocialDmSenderRegistry
} from "../../platform/index.js";
import type { TwitterAppCredential } from "../../vault/index.js";
import {
  InsightsRepository,
  registerTwitterConnectors,
  type RegisterTwitterConnectorsDeps
} from "./index.js";

function buildDeps(
  db: Database,
  overrides: Partial<RegisterTwitterConnectorsDeps> = {},
  cred?: TwitterAppCredential
): RegisterTwitterConnectorsDeps {
  return {
    config: {
      apiBaseUrl: "https://api.twitter.com/2",
      tier: "free",
      dmEnabled: false,
      oauthCallbackBaseUrl: "https://app.example.com"
    },
    registries: { oauth: new ConnectorRegistry(), dmSenders: new SocialDmSenderRegistry() },
    vault: { getTwitter: vi.fn(async () => cred) },
    brain: new SocialBrainRepository(db),
    broker: new RateLimitBroker({
      budgets: {
        twitter: { capacity: 10, refillPerSec: 1 },
        "twitter-dm": { capacity: 5, refillPerSec: 1 }
      }
    }),
    dlq: new DlqRepository(db),
    insights: new InsightsRepository(db),
    db,
    ...overrides
  };
}

describe("registerTwitterConnectors", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("registers the X OAuth exchanger", async () => {
    const deps = buildDeps(db);
    await registerTwitterConnectors(deps);
    expect(deps.registries.oauth.get("twitter")).toBeDefined();
  });

  it("returns the wired client, dispatcher, publisher, pollers and guards", async () => {
    const result = await registerTwitterConnectors(buildDeps(db));
    expect(result.client).toBeDefined();
    expect(result.dispatcher).toBeDefined();
    expect(result.publisher).toBeDefined();
    expect(result.dmSender).toBeDefined();
    expect(result.dmPoller).toBeDefined();
    expect(result.analyticsPoller).toBeDefined();
    expect(result.creditTracker).toBeDefined();
    expect(result.quotaGuard).toBeDefined();
  });

  it("force-disables DM on Free and does NOT register the DM sender", async () => {
    const deps = buildDeps(db, {
      config: { ...buildDeps(db).config, tier: "free", dmEnabled: true }
    });
    const result = await registerTwitterConnectors(deps);
    expect(result.dmEnabled).toBe(false);
    expect(deps.registries.dmSenders.platforms()).not.toContain("twitter");
    expect(deps.registries.dmSenders.supports("twitter")).toBe(false);
  });

  it("registers the DM sender on a paid, DM-enabled tier", async () => {
    const deps = buildDeps(db, {
      config: { ...buildDeps(db).config, tier: "basic", dmEnabled: true }
    });
    const result = await registerTwitterConnectors(deps);
    expect(result.dmEnabled).toBe(true);
    expect(deps.registries.dmSenders.platforms()).toContain("twitter");
    expect(deps.registries.dmSenders.supports("twitter")).toBe(true);
  });

  it("works whether or not app credentials are configured (lazy fail-closed)", async () => {
    await expect(registerTwitterConnectors(buildDeps(db))).resolves.toBeDefined();
    await expect(
      registerTwitterConnectors(buildDeps(db, {}, { clientId: "c", clientSecret: "s" }))
    ).resolves.toBeDefined();
  });

  it("sizes the quota cap from the active tier", async () => {
    const free = await registerTwitterConnectors(buildDeps(db));
    expect(free.quotaGuard.status().cap).toBe(1_500);
  });
});
