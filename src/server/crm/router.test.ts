import type { Database } from "better-sqlite3";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { Metrics } from "../metrics.js";
import { createApp } from "../app.js";
import { CrmRepository } from "../../crm/index.js";
import { createContactsRouter } from "./router.js";

// Helper: insert a CRM contact directly
function insertCrmContact(db: Database, displayName: string): number {
  return Number(
    db.prepare(`INSERT INTO crm_contacts (display_name) VALUES (?)`).run(displayName)
      .lastInsertRowid
  );
}

// Helper: insert merge record
function insertMergeRecord(db: Database, survivorId: number, sourceId: number): void {
  db.prepare(
    `INSERT INTO crm_contact_merges (survivor_id, source_id, mode) VALUES (?, ?, 'manual')`
  ).run(survivorId, sourceId);
}

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function insertSocialContact(
  db: Database,
  platform: string,
  platformContactId: string,
  metadata?: Record<string, unknown>
): number {
  const info = db
    .prepare(
      `INSERT INTO social_contacts (platform, platform_contact_id, metadata_json)
       VALUES (?, ?, ?)`
    )
    .run(platform, platformContactId, metadata ? JSON.stringify(metadata) : null);
  return Number(info.lastInsertRowid);
}

describe("contacts router", () => {
  let db: Database;
  let repo: CrmRepository;
  let server: Server;
  let base: string;
  let emitted: Array<{ event: string; payload: unknown }>;

  beforeEach(async () => {
    db = openDb({ path: ":memory:" });
    repo = new CrmRepository(db);
    emitted = [];
    const router = createContactsRouter({
      repo,
      db,
      emit: (event, payload) => emitted.push({ event, payload })
    });
    const app = createApp({
      metrics: new Metrics(),
      checkReadiness: () => ({ db: true, config: true, vault: true }),
      contactsRouter: router
    });
    const started = await listen(app);
    server = started.server;
    base = started.base;
  });

  afterEach(() => {
    server.close();
    db.close();
  });

  it("GET /api/contacts lists scored identities with rate-limit headers", async () => {
    insertSocialContact(db, "twitter", "t1", { followers: 100 });
    const res = await fetch(`${base}/api/contacts`);
    expect(res.status).toBe(200);
    expect(res.headers.get("ratelimit-limit")).toBe("60");
    const body = (await res.json()) as { contacts: Array<{ leadScore: { bucket: string } }> };
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0].leadScore.bucket).toBeDefined();
  });

  it("GET /api/contacts/:id returns detail with a timeline", async () => {
    insertSocialContact(db, "twitter", "t1");
    const list = await (await fetch(`${base}/api/contacts`)).json();
    const id = list.contacts[0].id as number;
    const res = await fetch(`${base}/api/contacts/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { contact: { timeline: unknown[] } };
    expect(Array.isArray(body.contact.timeline)).toBe(true);
  });

  it("GET /api/contacts/:id returns 422 for a non-numeric id", async () => {
    const res = await fetch(`${base}/api/contacts/not-a-number`);
    expect(res.status).toBe(422);
  });

  it("GET /api/contacts/:id returns 404 for a missing identity", async () => {
    const res = await fetch(`${base}/api/contacts/9999`);
    expect(res.status).toBe(404);
  });

  it("GET /api/contacts/suggested-merges surfaces email-match pairs", async () => {
    insertSocialContact(db, "instagram", "ig1", { bio: "ada@studio.com" });
    insertSocialContact(db, "linkedin", "li1", { bio: "ada@studio.com" });
    const res = await fetch(`${base}/api/contacts/suggested-merges`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { suggestions: unknown[] };
    expect(body.suggestions).toHaveLength(1);
  });

  it("POST /api/contacts/merge folds source into survivor and emits an event", async () => {
    insertSocialContact(db, "instagram", "ig1", { bio: "ada@studio.com" });
    insertSocialContact(db, "linkedin", "li1", { bio: "ada@studio.com" });
    const list = await (await fetch(`${base}/api/contacts`)).json();
    const [a, b] = list.contacts as Array<{ id: number }>;

    const res = await fetch(`${base}/api/contacts/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ survivorId: a.id, sourceId: b.id })
    });
    expect(res.status).toBe(200);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe("crm:merge");

    const merges = await (await fetch(`${base}/api/contacts/merges`)).json();
    expect(merges.merges).toHaveLength(1);
  });

  it("POST /api/contacts/merge returns 422 for a malformed body", async () => {
    const res = await fetch(`${base}/api/contacts/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ survivorId: "x" })
    });
    expect(res.status).toBe(422);
  });

  it("POST /api/contacts/merge returns 409 for a self-merge", async () => {
    insertSocialContact(db, "twitter", "t1");
    const list = await (await fetch(`${base}/api/contacts`)).json();
    const id = list.contacts[0].id as number;
    const res = await fetch(`${base}/api/contacts/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ survivorId: id, sourceId: id })
    });
    expect(res.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // DELETE /api/contacts/:id — GDPR right-to-delete (#138)
  // -------------------------------------------------------------------------

  describe("DELETE /api/contacts/:id", () => {
    it("returns 404 for a contact that does not exist", async () => {
      const res = await fetch(`${base}/api/contacts/9999`, { method: "DELETE" });
      expect(res.status).toBe(404);
    });

    it("returns 422 for a non-numeric id", async () => {
      const res = await fetch(`${base}/api/contacts/not-a-number`, { method: "DELETE" });
      expect(res.status).toBe(422);
    });

    it("returns 200 with receipt when deleting a simple contact (cascade=false)", async () => {
      insertSocialContact(db, "twitter", "t_del");
      const list = await (await fetch(`${base}/api/contacts`)).json();
      const id = list.contacts[0].id as number;

      const res = await fetch(`${base}/api/contacts/${id}?cascade=false`, {
        method: "DELETE"
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        receipt: { contactId: string; deletedAt: string; rowsDeleted: Record<string, number> };
      };
      expect(body.receipt.contactId).toBe(String(id));
      expect(body.receipt.rowsDeleted.contacts).toBe(1);
      expect(body.receipt.deletedAt).toMatch(/^\d{4}-/);
    });

    it("returns 409 when cascade=false but contact has merge history", async () => {
      const crmId = insertCrmContact(db, "Merge survivor");
      insertMergeRecord(db, crmId, 9999);

      const res = await fetch(`${base}/api/contacts/${crmId}?cascade=false`, {
        method: "DELETE"
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/cascade/i);
    });

    it("returns 200 when cascade=true and contact has merge history", async () => {
      const crmId = insertCrmContact(db, "Merge survivor");
      insertMergeRecord(db, crmId, 9999);

      const res = await fetch(`${base}/api/contacts/${crmId}?cascade=true`, {
        method: "DELETE"
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        receipt: { rowsDeleted: { merged_contacts?: number } };
      };
      expect(body.receipt.rowsDeleted.merged_contacts).toBe(1);
    });

    it("defaults cascade to false when query param is absent", async () => {
      const crmId = insertCrmContact(db, "No-merge contact");
      const res = await fetch(`${base}/api/contacts/${crmId}`, { method: "DELETE" });
      expect(res.status).toBe(200);
    });
  });
});
