import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../../db/index.js";
import { SocialBrainRepository } from "../../platform/social-brain/repository.js";
import { InvalidRuleError, RuleRepository } from "./repository.js";
import type { RuleInput } from "./types.js";

const baseRule: RuleInput = {
  name: "urgent → high priority",
  condition: { field: "message.body", op: "contains", value: "urgent" },
  actions: { priority: "high", tags: ["vip"], flag: true }
};

describe("RuleRepository", () => {
  let db: Database;
  let repo: RuleRepository;

  beforeEach(() => {
    db = openDb({ path: ":memory:" });
    repo = new RuleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates migration 0005 tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain("inbox_rules");
    expect(tables).toContain("inbox_rule_firings");
    expect(tables).toContain("inbox_thread_state");
  });

  it("creates, reads, updates, lists, and deletes rules", () => {
    const created = repo.create(baseRule);
    expect(created.id).toBeGreaterThan(0);
    expect(created.enabled).toBe(true);
    expect(repo.get(created.id)?.name).toBe(baseRule.name);

    const updated = repo.update(created.id, { ...baseRule, name: "renamed", enabled: false });
    expect(updated?.name).toBe("renamed");
    expect(updated?.enabled).toBe(false);

    expect(repo.list(true)).toHaveLength(1);
    expect(repo.list(false)).toHaveLength(0); // disabled excluded

    expect(repo.delete(created.id)).toBe(true);
    expect(repo.get(created.id)).toBeUndefined();
    expect(repo.delete(created.id)).toBe(false);
  });

  it("rejects malformed conditions and actions", () => {
    expect(() =>
      repo.create({ ...baseRule, condition: { field: "x", op: "danger" } as never })
    ).toThrow(InvalidRuleError);
    expect(() => repo.create({ ...baseRule, condition: "nope" as never })).toThrow(
      InvalidRuleError
    );
    expect(() => repo.create({ ...baseRule, actions: { priority: "boom" } as never })).toThrow(
      InvalidRuleError
    );
  });

  it("rejects conditions nested too deeply", () => {
    let cond: unknown = { field: "platform", op: "exists" };
    for (let i = 0; i < 15; i++) cond = { not: cond };
    expect(() => repo.create({ ...baseRule, condition: cond as never })).toThrow(InvalidRuleError);
  });

  it("returns undefined when updating a missing rule", () => {
    expect(repo.update(999, baseRule)).toBeUndefined();
  });

  describe("applyToMessage", () => {
    let brain: SocialBrainRepository;

    beforeEach(() => {
      brain = new SocialBrainRepository(db);
    });

    it("persists an auditable firing and updates thread state when a rule matches", () => {
      const r = repo.create(baseRule);
      const contact = brain.upsertContact({
        platform: "instagram",
        platformContactId: "u1",
        handle: "alice"
      });
      const thread = brain.upsertThread({
        platform: "instagram",
        platformThreadId: "t1",
        contactId: contact.id
      });
      const msg = brain.upsertMessage({
        platform: "instagram",
        platformMessageId: "m1",
        threadId: thread.id,
        contactId: contact.id,
        direction: "inbound",
        body: "this is urgent please help",
        metadata: { kind: "dm" }
      });

      const evaluation = repo.applyToMessage({ message: msg, contact, thread });
      expect(evaluation.firedRuleIds).toEqual([r.id]);
      expect(evaluation.priority).toBe("high");
      expect(evaluation.flagged).toBe(true);

      // Audit trail persists across a reopen of the repository (durable).
      const firings = new RuleRepository(db).listFirings(r.id);
      expect(firings).toHaveLength(1);
      expect(firings[0]).toMatchObject({
        ruleId: r.id,
        platform: "instagram",
        platformMessageId: "m1",
        messageId: msg.id
      });
      expect(firings[0].actions.priority).toBe("high");

      // Thread state reflects the rule-derived priority + flag.
      const state = db
        .prepare("SELECT priority, flagged FROM inbox_thread_state WHERE thread_id = ?")
        .get(thread.id);
      expect(state).toMatchObject({ priority: "high", flagged: 1 });

      // And it's queryable by message coordinates.
      expect(new RuleRepository(db).listFiringsForMessage("instagram", "m1")).toHaveLength(1);
    });

    it("records no firing when nothing matches", () => {
      const r = repo.create(baseRule);
      const msg = brain.upsertMessage({
        platform: "instagram",
        platformMessageId: "m2",
        direction: "inbound",
        body: "just saying hi"
      });
      const evaluation = repo.applyToMessage({ message: msg });
      expect(evaluation.firedRuleIds).toEqual([]);
      expect(repo.listFirings(r.id)).toHaveLength(0);
    });

    it("retains firing audit rows when the rule is deleted (rule_id set null)", () => {
      const r = repo.create(baseRule);
      const msg = brain.upsertMessage({
        platform: "instagram",
        platformMessageId: "m3",
        direction: "inbound",
        body: "urgent matter"
      });
      repo.applyToMessage({ message: msg });
      expect(repo.listFirings(r.id)).toHaveLength(1);

      repo.delete(r.id);

      // The append-only audit row survives the rule deletion (migration 0006:
      // ON DELETE SET NULL), it is just no longer linked to a live rule.
      expect(db.prepare("SELECT COUNT(*) AS n FROM inbox_rule_firings").get()).toMatchObject({
        n: 1
      });
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM inbox_rule_firings WHERE rule_id IS NULL").get()
      ).toMatchObject({ n: 1 });

      // Still readable by message coordinates, with ruleId now undefined.
      const retained = repo.listFiringsForMessage("instagram", "m3");
      expect(retained).toHaveLength(1);
      expect(retained[0].ruleId).toBeUndefined();
      expect(retained[0].actions.priority).toBe("high");
    });
  });
});
