import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import type { Database } from "better-sqlite3";
import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { BrandVoiceRepository } from "../../personality/rulebook-repository.js";
import { createOnboardingRouter } from "./router.js";

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("onboarding router", () => {
  let server: Server;
  let base: string;
  let db: Database;
  let brandVoice: BrandVoiceRepository;

  async function mount(): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use("/api/onboarding", createOnboardingRouter({ brandVoice }));
    ({ server, base } = await listen(app));
  }

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    brandVoice = new BrandVoiceRepository(db);
    await mount();
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  describe("GET /recipes", () => {
    it("returns the three starter recipes", async () => {
      const res = await fetch(`${base}/api/onboarding/recipes`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.recipes.map((r: any) => r.id)).toEqual(["creator", "small-biz", "agency"]);
    });
  });

  describe("POST /recipes/apply", () => {
    it("seeds the rulebook and returns suggested defaults", async () => {
      const res = await fetch(`${base}/api/onboarding/recipes/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe: "creator" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.applied).toBe(true);
      expect(body.recipe).toBe("creator");
      expect(body.suggestedPlatforms).toContain("tiktok");
      expect(body.cadencePerWeek).toBeGreaterThan(0);
      expect(brandVoice.get().tone.length).toBeGreaterThan(0);
    });

    it("rejects an unknown recipe (400)", async () => {
      const res = await fetch(`${base}/api/onboarding/recipes/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipe: "ceo" })
      });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /brand-voice/import", () => {
    it("imports JSON exemplars and reports how many were added", async () => {
      const res = await fetch(`${base}/api/onboarding/brand-voice/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "json", content: '["one", "two"]' })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.imported).toBe(true);
      expect(body.added).toBe(2);
      expect(body.rulebook.exemplars).toEqual(["one", "two"]);
    });

    it("imports CSV exemplars", async () => {
      const res = await fetch(`${base}/api/onboarding/brand-voice/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "csv", content: "alpha\nbravo" })
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, any>;
      expect(body.rulebook.exemplars).toEqual(["alpha", "bravo"]);
    });

    it("returns 422 for malformed JSON", async () => {
      const res = await fetch(`${base}/api/onboarding/brand-voice/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "json", content: "{bad" })
      });
      expect(res.status).toBe(422);
    });

    it("returns 422 when no brand-voice content is found", async () => {
      const res = await fetch(`${base}/api/onboarding/brand-voice/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "json", content: "{}" })
      });
      expect(res.status).toBe(422);
    });

    it("rejects an invalid format (400)", async () => {
      const res = await fetch(`${base}/api/onboarding/brand-voice/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "xml", content: "x" })
      });
      expect(res.status).toBe(400);
    });
  });
});
