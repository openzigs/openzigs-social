import { describe, expect, it } from "vitest";

import type {
  SocialContact,
  SocialMessage,
  SocialThread
} from "../../platform/social-brain/repository.js";
import type { Condition, Facts, RuleDefinition } from "./types.js";
import { buildFacts, evaluateCondition, evaluateRules } from "./engine.js";

function message(overrides: Partial<SocialMessage> = {}): SocialMessage {
  return {
    id: 1,
    platform: "instagram",
    platformMessageId: "m1",
    threadId: 1,
    contactId: 1,
    direction: "inbound",
    body: "Hello there, I need urgent help with my order",
    metadata: { kind: "dm" },
    sentAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function contact(overrides: Partial<SocialContact> = {}): SocialContact {
  return {
    id: 1,
    platform: "instagram",
    platformContactId: "u1",
    handle: "alice",
    displayName: "Alice",
    metadata: { followerCount: 50_000, verified: true },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function thread(overrides: Partial<SocialThread> = {}): SocialThread {
  return {
    id: 1,
    platform: "instagram",
    platformThreadId: "t1",
    contactId: 1,
    subject: "Order #42",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function rule(
  id: number,
  condition: Condition,
  actions: RuleDefinition["actions"],
  enabled = true
): RuleDefinition {
  return {
    id,
    name: `rule-${id}`,
    enabled,
    sortOrder: id,
    condition,
    actions,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };
}

describe("buildFacts", () => {
  it("flattens message, contact, and thread into facts", () => {
    const facts = buildFacts({ message: message(), contact: contact(), thread: thread() });
    expect(facts.platform).toBe("instagram");
    expect(facts.direction).toBe("inbound");
    expect(facts.kind).toBe("dm");
    expect(facts["author.handle"]).toBe("alice");
    expect(facts["author.followerCount"]).toBe(50_000);
    expect(facts["author.verified"]).toBe(true);
    expect(facts["thread.subject"]).toBe("Order #42");
  });

  it("defaults kind to dm and strips undefined facts", () => {
    const facts = buildFacts({ message: message({ metadata: undefined }) });
    expect(facts.kind).toBe("dm");
    expect("author.handle" in facts).toBe(false);
  });

  it("reads kind=comment from metadata", () => {
    const facts = buildFacts({ message: message({ metadata: { kind: "comment" } }) });
    expect(facts.kind).toBe("comment");
  });
});

describe("evaluateCondition", () => {
  const facts: Facts = buildFacts({ message: message(), contact: contact(), thread: thread() });

  it("matches eq / neq", () => {
    expect(evaluateCondition({ field: "platform", op: "eq", value: "instagram" }, facts)).toBe(
      true
    );
    expect(evaluateCondition({ field: "platform", op: "neq", value: "x" }, facts)).toBe(true);
    expect(evaluateCondition({ field: "platform", op: "eq", value: "x" }, facts)).toBe(false);
  });

  it("matches numeric comparisons", () => {
    expect(
      evaluateCondition({ field: "author.followerCount", op: "gt", value: 10_000 }, facts)
    ).toBe(true);
    expect(
      evaluateCondition({ field: "author.followerCount", op: "gte", value: 50_000 }, facts)
    ).toBe(true);
    expect(
      evaluateCondition({ field: "author.followerCount", op: "lt", value: 10_000 }, facts)
    ).toBe(false);
    expect(
      evaluateCondition({ field: "author.followerCount", op: "lte", value: 50_000 }, facts)
    ).toBe(true);
  });

  it("matches contains / startsWith case-insensitively", () => {
    expect(
      evaluateCondition({ field: "message.body", op: "contains", value: "URGENT" }, facts)
    ).toBe(true);
    expect(
      evaluateCondition({ field: "message.body", op: "startsWith", value: "hello" }, facts)
    ).toBe(true);
    expect(
      evaluateCondition({ field: "message.body", op: "contains", value: "refund" }, facts)
    ).toBe(false);
  });

  it("matches in / exists", () => {
    expect(
      evaluateCondition({ field: "platform", op: "in", value: ["x", "instagram"] }, facts)
    ).toBe(true);
    expect(evaluateCondition({ field: "author.verified", op: "exists" }, facts)).toBe(true);
    expect(evaluateCondition({ field: "author.nope", op: "exists" }, facts)).toBe(false);
  });

  it("composes all / any / not", () => {
    const cond: Condition = {
      all: [
        { field: "platform", op: "eq", value: "instagram" },
        {
          any: [
            { field: "kind", op: "eq", value: "comment" },
            { field: "kind", op: "eq", value: "dm" }
          ]
        },
        { not: { field: "direction", op: "eq", value: "outbound" } }
      ]
    };
    expect(evaluateCondition(cond, facts)).toBe(true);
  });

  it("treats empty all as true and empty any as false", () => {
    expect(evaluateCondition({ all: [] }, facts)).toBe(true);
    expect(evaluateCondition({ any: [] }, facts)).toBe(false);
  });

  it("keeps a forged operator inert (no arbitrary code path)", () => {
    const forged = { field: "platform", op: "__proto__" } as unknown as Condition;
    expect(evaluateCondition(forged, facts)).toBe(false);
  });

  it("never reads the prototype chain for a forged field", () => {
    // A rule referencing __proto__ / constructor / prototype must resolve to
    // undefined (no-match), never a truthy object off the prototype chain.
    for (const field of ["__proto__", "constructor", "prototype"]) {
      expect(evaluateCondition({ field, op: "exists" }, facts)).toBe(false);
      expect(evaluateCondition({ field, op: "eq", value: "[object Object]" }, facts)).toBe(false);
      expect(evaluateCondition({ field, op: "contains", value: "Object" }, facts)).toBe(false);
    }
  });
});

describe("evaluateRules", () => {
  const facts = buildFacts({ message: message(), contact: contact(), thread: thread() });

  it("aggregates priority (highest wins), unions tags, ORs flag, records firings", () => {
    const rules = [
      rule(
        1,
        { field: "platform", op: "eq", value: "instagram" },
        { priority: "high", tags: ["sales"] }
      ),
      rule(
        2,
        { field: "message.body", op: "contains", value: "urgent" },
        { priority: "urgent", tags: ["vip"], flag: true }
      ),
      rule(3, { field: "platform", op: "eq", value: "x" }, { priority: "low" })
    ];
    const result = evaluateRules(rules, facts);
    expect(result.firedRuleIds).toEqual([1, 2]);
    expect(result.priority).toBe("urgent");
    expect(result.tags.sort()).toEqual(["sales", "vip"]);
    expect(result.flagged).toBe(true);
    expect(result.firings).toHaveLength(2);
  });

  it("skips disabled rules", () => {
    const rules = [
      rule(1, { field: "platform", op: "eq", value: "instagram" }, { priority: "high" }, false)
    ];
    const result = evaluateRules(rules, facts);
    expect(result.firedRuleIds).toEqual([]);
    expect(result.priority).toBeUndefined();
  });

  it("captures the last route", () => {
    const rules = [
      rule(1, { all: [] }, { route: "support" }),
      rule(2, { all: [] }, { route: "billing" })
    ];
    expect(evaluateRules(rules, facts).route).toBe("billing");
  });
});
