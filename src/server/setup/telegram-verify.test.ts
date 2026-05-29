import { describe, expect, it, vi } from "vitest";

import { verifyTelegram } from "./telegram-verify.js";

/** Build a fetch stub that maps URL substrings to canned JSON responses. */
function stubFetch(routes: {
  getMe?: unknown;
  sendMessage?: unknown;
  getMeStatus?: number;
  sendStatus?: number;
}): {
  fetchImpl: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/getMe")) {
      return new Response(JSON.stringify(routes.getMe ?? { ok: false }), {
        status: routes.getMeStatus ?? 200
      });
    }
    return new Response(JSON.stringify(routes.sendMessage ?? { ok: true }), {
      status: routes.sendStatus ?? 200
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("verifyTelegram", () => {
  it("returns valid + botUsername and sends a test message on success", async () => {
    const { fetchImpl, calls } = stubFetch({
      getMe: { ok: true, result: { username: "my_bot" } },
      sendMessage: { ok: true }
    });
    const res = await verifyTelegram({ botToken: "123:abc", adminChatId: "555" }, fetchImpl);
    expect(res).toEqual({ valid: true, botUsername: "my_bot" });
    expect(calls.some((c) => c.includes("/getMe"))).toBe(true);
    expect(calls.some((c) => c.includes("/sendMessage"))).toBe(true);
  });

  it("returns invalid bot token when getMe fails", async () => {
    const { fetchImpl } = stubFetch({ getMe: { ok: false }, getMeStatus: 401 });
    const res = await verifyTelegram({ botToken: "bad", adminChatId: "5" }, fetchImpl);
    expect(res).toEqual({ valid: false, reason: "invalid bot token" });
  });

  it("returns invalid when sendMessage fails (bad chat id)", async () => {
    const { fetchImpl } = stubFetch({
      getMe: { ok: true, result: { username: "b" } },
      sendMessage: { ok: false },
      sendStatus: 400
    });
    const res = await verifyTelegram({ botToken: "123:abc", adminChatId: "999" }, fetchImpl);
    expect(res.valid).toBe(false);
    expect(res.botUsername).toBe("b");
    expect(res.reason).toBe("could not send test message");
  });

  it("returns invalid (no throw) when getMe is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const res = await verifyTelegram({ botToken: "123:abc", adminChatId: "5" }, fetchImpl);
    expect(res).toEqual({ valid: false, reason: "could not reach Telegram" });
  });

  it("returns invalid when sendMessage throws after a good getMe", async () => {
    let first = true;
    const fetchImpl = vi.fn(async (_url: string | URL | Request) => {
      if (first) {
        first = false;
        return new Response(JSON.stringify({ ok: true, result: { username: "b" } }), {
          status: 200
        });
      }
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const res = await verifyTelegram({ botToken: "123:abc", adminChatId: "5" }, fetchImpl);
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("could not reach Telegram");
  });

  it("never includes the bot token in the result", async () => {
    const { fetchImpl } = stubFetch({ getMe: { ok: false }, getMeStatus: 401 });
    const res = await verifyTelegram({ botToken: "123:LEAKME", adminChatId: "5" }, fetchImpl);
    expect(JSON.stringify(res)).not.toContain("LEAKME");
  });
});
