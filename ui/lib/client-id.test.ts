import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_ID_STORAGE_KEY, getClientId, persistClientId } from "./client-id";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("getClientId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates and persists a fresh v4 uuid when none stored", () => {
    const id = getClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(id);
  });

  it("returns the stored id when valid", () => {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, UUID);
    expect(getClientId()).toBe(UUID);
  });

  it("replaces a malformed stored id with a clean uuid", () => {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, "../../etc/passwd");
    const id = getClientId();
    expect(id).not.toBe("../../etc/passwd");
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("falls back to a generated uuid when crypto.randomUUID is absent", () => {
    const original = crypto.randomUUID;
    // @ts-expect-error force the fallback branch
    crypto.randomUUID = undefined;
    const id = getClientId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    crypto.randomUUID = original;
  });

  it("survives localStorage throwing on read", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => getClientId()).not.toThrow();
    spy.mockRestore();
  });
});

describe("persistClientId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores a valid uuid", () => {
    persistClientId(UUID);
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(UUID);
  });

  it("ignores a non-uuid value", () => {
    persistClientId("not-a-uuid");
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBeNull();
  });
});
