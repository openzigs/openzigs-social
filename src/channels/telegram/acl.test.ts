import { describe, expect, it, vi } from "vitest";
import type { Context, NextFunction } from "grammy";

import { AdminAcl, createAclMiddleware, normalizeChatId } from "./acl.js";

describe("normalizeChatId", () => {
  it("stringifies numbers and trims strings", () => {
    expect(normalizeChatId(123)).toBe("123");
    expect(normalizeChatId("  456 ")).toBe("456");
  });

  it("returns undefined for nullish or empty input", () => {
    expect(normalizeChatId(undefined)).toBeUndefined();
    expect(normalizeChatId(null)).toBeUndefined();
    expect(normalizeChatId("   ")).toBeUndefined();
  });
});

describe("AdminAcl", () => {
  it("admits configured ids (number or string) and rejects others", () => {
    const acl = new AdminAcl([123, "456"]);
    expect(acl.isAdmin(123)).toBe(true);
    expect(acl.isAdmin("123")).toBe(true);
    expect(acl.isAdmin(456)).toBe(true);
    expect(acl.isAdmin(789)).toBe(false);
    expect(acl.size).toBe(2);
  });

  it("is deny-by-default when empty", () => {
    const acl = new AdminAcl([]);
    expect(acl.isAdmin(123)).toBe(false);
    expect(acl.isAdmin(undefined)).toBe(false);
    expect(acl.size).toBe(0);
  });

  it("ignores empty entries when building the allow-list", () => {
    const acl = new AdminAcl(["", "  ", "42"]);
    expect(acl.size).toBe(1);
    expect(acl.isAdmin(42)).toBe(true);
  });
});

function fakeCtx(chatId: number | undefined, isCallback = false): Context {
  return {
    chat: chatId === undefined ? undefined : { id: chatId },
    from: chatId === undefined ? undefined : { id: chatId },
    update: isCallback ? { callback_query: {} } : { message: {} }
  } as unknown as Context;
}

describe("createAclMiddleware", () => {
  it("calls next for an admin chat", async () => {
    const acl = new AdminAcl([5]);
    const next = vi.fn<NextFunction>(async () => undefined);
    await createAclMiddleware(acl)(fakeCtx(5), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("drops non-admin updates without calling next and logs the denial", async () => {
    const acl = new AdminAcl([5]);
    const next = vi.fn<NextFunction>(async () => undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    await createAclMiddleware(acl, logger)(fakeCtx(99, true), next);
    expect(next).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "telegram.acl.denied",
      expect.objectContaining({ chatId: "99", updateType: "callback_query" })
    );
  });

  it("reports an unknown chat id when none is present", async () => {
    const acl = new AdminAcl([5]);
    const next = vi.fn<NextFunction>(async () => undefined);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    await createAclMiddleware(acl, logger)(fakeCtx(undefined), next);
    expect(next).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "telegram.acl.denied",
      expect.objectContaining({ chatId: "unknown", updateType: "message" })
    );
  });
});
