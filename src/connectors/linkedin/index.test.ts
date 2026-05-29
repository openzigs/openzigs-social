import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openDb } from "../../db/index.js";
import {
  ConnectorRegistry,
  DlqRepository,
  RateLimitBroker,
  SocialBrainRepository
} from "../../platform/index.js";
import type { LinkedInAppCredential } from "../../vault/index.js";
import {
  InsightsRepository,
  registerLinkedInConnectors,
  type RegisterLinkedInConnectorsDeps
} from "./index.js";

const config = {
  restBaseUrl: "https://api.linkedin.com/rest",
  oauthCallbackBaseUrl: "https://app.example.com"
};

function buildDeps(
  db: Database,
  overrides: Partial<RegisterLinkedInConnectorsDeps> = {},
  cred?: LinkedInAppCredential
): RegisterLinkedInConnectorsDeps {
  return {
    config,
    registries: { oauth: new ConnectorRegistry() },
    vault: { getLinkedIn: vi.fn(async () => cred) },
    brain: new SocialBrainRepository(db),
    broker: new RateLimitBroker({ budgets: { linkedin: { capacity: 10, refillPerSec: 1 } } }),
    dlq: new DlqRepository(db),
    insights: new InsightsRepository(db),
    ...overrides
  };
}

describe("registerLinkedInConnectors", () => {
  let db: Database;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
  });

  afterEach(() => {
    db.close();
  });

  it("registers the LinkedIn OAuth exchanger", async () => {
    const deps = buildDeps(db);
    await registerLinkedInConnectors(deps);
    expect(deps.registries.oauth.get("linkedin")).toBeDefined();
  });

  it("returns the constructed client, dispatcher and pollers", async () => {
    const result = await registerLinkedInConnectors(buildDeps(db));
    expect(result.client).toBeDefined();
    expect(result.dispatcher).toBeDefined();
    expect(result.publisher).toBeDefined();
    expect(result.commentPoller).toBeDefined();
    expect(result.analyticsPoller).toBeDefined();
  });

  it("works whether or not app credentials are configured (lazy fail-closed)", async () => {
    await expect(registerLinkedInConnectors(buildDeps(db))).resolves.toBeDefined();
    await expect(
      registerLinkedInConnectors(buildDeps(db, {}, { clientId: "c", clientSecret: "s" }))
    ).resolves.toBeDefined();
  });
});
