import { describe, expect, it } from "vitest";

import {
  collectStrings,
  discoverEmail,
  discoverFollowerCount,
  extractEmails,
  normalizeEmail
} from "./email.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("returns undefined for blank/non-string input", () => {
    expect(normalizeEmail("")).toBeUndefined();
    expect(normalizeEmail("   ")).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
    expect(normalizeEmail(undefined)).toBeUndefined();
  });
});

describe("extractEmails", () => {
  it("finds and de-duplicates normalised emails across texts", () => {
    const found = extractEmails([
      "reach me at Ada@Example.com or ada@example.com",
      "work: ada.work@corp.io",
      null,
      undefined
    ]);
    expect(found).toEqual(["ada@example.com", "ada.work@corp.io"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(extractEmails(["no addresses here", ""])).toEqual([]);
  });
});

describe("collectStrings", () => {
  it("recursively gathers string values from nested metadata", () => {
    const meta = { bio: "hi", links: ["a", { url: "b" }], n: 1, ok: true };
    expect(collectStrings(meta).sort()).toEqual(["a", "b", "hi"]);
  });
});

describe("discoverEmail", () => {
  it("prefers an email in metadata (bio link)", () => {
    const meta = { bio: "DM or email ada@studio.com", followers: 1200 };
    expect(discoverEmail(meta, ["unrelated message"])).toBe("ada@studio.com");
  });

  it("falls back to message bodies when metadata has none", () => {
    expect(discoverEmail({ bio: "no email" }, ["ping me: ada@studio.com"])).toBe("ada@studio.com");
  });

  it("returns undefined when no email is present anywhere", () => {
    expect(discoverEmail({ bio: "nope" }, ["still nope"])).toBeUndefined();
  });
});

describe("discoverFollowerCount", () => {
  it("reads common follower keys as a non-negative integer", () => {
    expect(discoverFollowerCount({ followerCount: 4200 })).toBe(4200);
    expect(discoverFollowerCount({ followers: "999" })).toBe(999);
    expect(discoverFollowerCount({ follower_count: 12.7 })).toBe(12);
  });

  it("returns 0 when absent or invalid", () => {
    expect(discoverFollowerCount({})).toBe(0);
    expect(discoverFollowerCount(null)).toBe(0);
    expect(discoverFollowerCount({ followers: -5 })).toBe(0);
  });
});
