import { Bot, type Context } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApprovalQueue } from "../../approvals/index.js";
import type { SocialDmSender } from "../social/dm-sender.js";
import { buildApprovalCallbackData } from "./approval-keyboard.js";
import { TelegramChannel } from "./telegram-channel.js";

const ADMIN = 4242;
const OUTSIDER = 9999;

const BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: "OzBot",
  username: "ozbot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false
};

interface RecordedCall {
  method: string;
  payload: Record<string, unknown>;
}

function createTestBot(): { bot: Bot<Context>; calls: RecordedCall[] } {
  const bot = new Bot<Context>("12345:FAKE-TOKEN", { botInfo: BOT_INFO });
  const calls: RecordedCall[] = [];
  let messageId = 100;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "sendMessage") {
      return {
        ok: true,
        result: {
          message_id: messageId++,
          date: 0,
          chat: { id: 0, type: "private", first_name: "x" },
          text: (payload as { text?: string }).text ?? ""
        }
      } as never;
    }
    return { ok: true, result: true } as never;
  });
  return { bot, calls };
}

let updateId = 1;

function cmdUpdate(chatId: number, text: string): Update {
  const command = text.split(" ")[0];
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: 0,
      chat: { id: chatId, type: "private", first_name: "A" },
      from: { id: chatId, is_bot: false, first_name: "A" },
      text,
      entities: text.startsWith("/")
        ? [{ type: "bot_command", offset: 0, length: command.length }]
        : []
    }
  } as Update;
}

function cbUpdate(chatId: number, data: string): Update {
  return {
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: { id: chatId, is_bot: false, first_name: "A" },
      message: {
        message_id: 1,
        date: 0,
        chat: { id: chatId, type: "private", first_name: "A" },
        text: "x"
      },
      chat_instance: "ci",
      data
    }
  } as Update;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function fakeSender(overrides: Partial<SocialDmSender> = {}): SocialDmSender {
  return {
    supports: () => true,
    sendDm: async (req) => ({
      platform: req.platform,
      recipientId: req.recipientId,
      messageId: "m1",
      deliveredAt: 0
    }),
    ...overrides
  };
}

describe("TelegramChannel", () => {
  let approvals: ApprovalQueue;

  beforeEach(() => {
    approvals = new ApprovalQueue();
  });

  afterEach(() => {
    approvals.clear();
    vi.useRealTimers();
  });

  it("register is idempotent", () => {
    const { bot } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();
    expect(() => channel.register()).not.toThrow();
  });

  it("pushes an Approve/Reject keyboard to admin chats on a new request", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    void approvals.request({ summary: "Post a tweet" });
    await flush();

    const sent = calls.filter((c) => c.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.chat_id).toBe(String(ADMIN));
    const markup = sent[0].payload.reply_markup as {
      inline_keyboard: { callback_data: string }[][];
    };
    expect(markup.inline_keyboard[0][0].callback_data).toMatch(/^oz:appr:approve:/);
  });

  it("does not push when there are no admin chats", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [] });
    channel.register();
    void approvals.request({ summary: "x" });
    await flush();
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });

  it("settles the approval when the admin taps Approve", async () => {
    const { bot } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    const id = "req-1";
    const decided = approvals.request({ summary: "ship it" }, { id });
    await flush();

    await bot.handleUpdate(cbUpdate(ADMIN, buildApprovalCallbackData("approve", id)));
    await expect(decided).resolves.toMatchObject({ decision: "approve" });
    expect(approvals.has(id)).toBe(false);
  });

  it("edits the pushed message to show the outcome on decision", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    const id = "req-2";
    void approvals.request({ summary: "edit me" }, { id });
    await flush();
    approvals.decide(id, "reject");
    await flush();

    const edits = calls.filter((c) => c.method === "editMessageText");
    expect(edits).toHaveLength(1);
    expect(edits[0].payload.text).toContain("Rejected");
  });

  it("renders a timeout outcome", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    void approvals.request({ summary: "slow" }, { id: "req-3", timeoutMs: 5 });
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await flush();

    const edits = calls.filter((c) => c.method === "editMessageText");
    expect(edits.at(-1)?.payload.text).toContain("Timed out");
  });

  it("ignores a callback for an already-settled approval (stale keyboard)", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    const id = "req-4";
    void approvals.request({ summary: "race" }, { id });
    await flush();
    approvals.decide(id, "approve");
    await flush();

    await bot.handleUpdate(cbUpdate(ADMIN, buildApprovalCallbackData("reject", id)));
    expect(calls.some((c) => c.method === "editMessageReplyMarkup")).toBe(true);
  });

  it("denies non-admin chats (no reply, no command execution)", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    await bot.handleUpdate(cmdUpdate(OUTSIDER, "/status"));
    expect(calls).toHaveLength(0);
  });

  it("answers /start, /status and /privacy for admins", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    await bot.handleUpdate(cmdUpdate(ADMIN, "/start"));
    await bot.handleUpdate(cmdUpdate(ADMIN, "/status"));
    await bot.handleUpdate(cmdUpdate(ADMIN, "/privacy"));

    const texts = calls.filter((c) => c.method === "sendMessage").map((c) => c.payload.text);
    expect(texts[0]).toContain("@ozbot");
    expect(texts[1]).toContain("Pending approvals: 0");
    expect(texts[2]).toContain("Privacy");
  });

  it("/queue reports empty then lists pending approvals via the menu", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    await bot.handleUpdate(cmdUpdate(ADMIN, "/queue"));
    expect(calls.at(-1)?.payload.text).toContain("No pending approvals");

    calls.length = 0;
    void approvals.request({ summary: "review this" }, { id: "q-1" });
    await flush();
    calls.length = 0;

    await bot.handleUpdate(cmdUpdate(ADMIN, "/queue"));
    const queueReply = calls.find(
      (c) => c.method === "sendMessage" && String(c.payload.text).includes("Pending approvals")
    );
    expect(queueReply).toBeDefined();
    expect(queueReply?.payload.reply_markup).toBeDefined();
  });

  it("settles an approval through the /queue menu button", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    const id = "menu-1";
    const decided = approvals.request({ summary: "via menu" }, { id });
    await flush();
    calls.length = 0;

    await bot.handleUpdate(cmdUpdate(ADMIN, "/queue"));
    const queueReply = calls.find((c) => c.method === "sendMessage" && c.payload.reply_markup);
    const markup = queueReply?.payload.reply_markup as {
      inline_keyboard: { callback_data?: string }[][];
    };
    const approveData = markup.inline_keyboard[0][0].callback_data;
    expect(approveData).toBeDefined();

    await bot.handleUpdate(cbUpdate(ADMIN, approveData as string));
    await expect(decided).resolves.toMatchObject({ decision: "approve" });
  });

  it("relays a DM through the sender on /dm", async () => {
    const sendDm = vi.fn(fakeSender().sendDm);
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({
      bot,
      approvals,
      adminChatIds: [ADMIN],
      dmSender: fakeSender({ sendDm })
    });
    channel.register();

    await bot.handleUpdate(cmdUpdate(ADMIN, "/dm instagram @alice hey there"));
    expect(sendDm).toHaveBeenCalledWith({
      platform: "instagram",
      recipientId: "@alice",
      text: "hey there"
    });
    expect(calls.at(-1)?.payload.text).toContain("Sent DM on instagram");
  });

  it("reports unavailable DM relay when no sender is wired", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();

    await bot.handleUpdate(cmdUpdate(ADMIN, "/dm instagram @alice hi"));
    expect(calls.at(-1)?.payload.text).toContain("Could not send DM");
  });

  it("shows usage help for a malformed /dm", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({
      bot,
      approvals,
      adminChatIds: [ADMIN],
      dmSender: fakeSender()
    });
    channel.register();

    await bot.handleUpdate(cmdUpdate(ADMIN, "/dm instagram"));
    expect(calls.at(-1)?.payload.text).toContain("Usage: /dm");
  });

  it("stop detaches queue listeners so no further pushes occur", async () => {
    const { bot, calls } = createTestBot();
    const channel = new TelegramChannel({ bot, approvals, adminChatIds: [ADMIN] });
    channel.register();
    await channel.stop();

    void approvals.request({ summary: "after stop" });
    await flush();
    expect(calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });
});
