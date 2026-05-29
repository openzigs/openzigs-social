import { Bot, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it, vi } from "vitest";

import { ApprovalQueue } from "../../approvals/index.js";
import type { TelegramCredential } from "../../vault/types.js";
import { createTelegramChannelFromVault } from "./factory.js";
import type { TelegramRuntimeConfig } from "./types.js";

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

function config(overrides: Partial<TelegramRuntimeConfig> = {}): TelegramRuntimeConfig {
  return {
    enabled: true,
    mode: "polling",
    approvalTimeoutMs: 0,
    adminChatIds: [],
    ...overrides
  };
}

function vaultWith(cred: TelegramCredential | undefined) {
  return { getTelegram: vi.fn(async () => cred) };
}

const botFactory = (token: string): Bot<Context> => new Bot<Context>(token, { botInfo: BOT_INFO });

describe("createTelegramChannelFromVault", () => {
  it("returns undefined when the channel is disabled", async () => {
    const vault = vaultWith({ botToken: "t", adminChatId: "1" });
    const channel = await createTelegramChannelFromVault({
      vault,
      config: config({ enabled: false }),
      approvals: new ApprovalQueue(),
      botFactory
    });
    expect(channel).toBeUndefined();
    expect(vault.getTelegram).not.toHaveBeenCalled();
  });

  it("returns undefined and warns when no credentials are stored", async () => {
    const warn = vi.fn();
    const channel = await createTelegramChannelFromVault({
      vault: vaultWith(undefined),
      config: config(),
      approvals: new ApprovalQueue(),
      botFactory,
      logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }
    });
    expect(channel).toBeUndefined();
    expect(warn).toHaveBeenCalledWith("telegram.disabled", expect.objectContaining({}));
  });

  it("builds a channel using the vault token and merged admin ids", async () => {
    const made: string[] = [];
    const channel = await createTelegramChannelFromVault({
      vault: vaultWith({ botToken: "secret-token", adminChatId: "100" }),
      config: config({ adminChatIds: ["200"] }),
      approvals: new ApprovalQueue(),
      botFactory: (token) => {
        made.push(token);
        return new Bot<Context>(token, { botInfo: BOT_INFO });
      }
    });
    expect(channel).toBeDefined();
    expect(made).toEqual(["secret-token"]);
  });

  it("defaults to a real grammy Bot when no botFactory is supplied", async () => {
    const channel = await createTelegramChannelFromVault({
      vault: vaultWith({ botToken: "12345:FAKE", adminChatId: "100" }),
      config: config(),
      approvals: new ApprovalQueue()
    });
    expect(channel).toBeDefined();
  });
});
