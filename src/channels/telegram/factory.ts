/**
 * TelegramChannel factory (epic #47).
 *
 * Resolves the bot token + primary admin chat id from the encrypted credential
 * vault, constructs a grammy {@link Bot}, and returns a (not-yet-started)
 * {@link TelegramChannel}. Secret resolution is isolated here so the channel
 * itself stays trivially testable with an injected bot. Returns `undefined`
 * when no Telegram credentials are present so the caller can no-op cleanly.
 */
import { Bot, type Context } from "grammy";

import type { ApprovalQueue } from "../../approvals/index.js";
import type { CredentialVault } from "../../vault/index.js";
import type { SocialDmSender } from "../social/dm-sender.js";
import { TelegramChannel } from "./telegram-channel.js";
import type { ChannelLogger, TelegramRuntimeConfig } from "./types.js";

/** Options for {@link createTelegramChannelFromVault}. */
export interface CreateTelegramChannelOptions {
  vault: Pick<CredentialVault, "getTelegram">;
  config: TelegramRuntimeConfig;
  approvals: ApprovalQueue;
  dmSender?: SocialDmSender;
  logger?: ChannelLogger;
  /** Override the bot factory (tests inject a transformer-backed bot). */
  botFactory?: (token: string) => Bot<Context>;
}

/**
 * Build a TelegramChannel from vault credentials + config. Resolves to
 * `undefined` when the channel is disabled or no bot token is stored.
 */
export async function createTelegramChannelFromVault(
  opts: CreateTelegramChannelOptions
): Promise<TelegramChannel | undefined> {
  if (!opts.config.enabled) return undefined;

  const cred = await opts.vault.getTelegram();
  if (!cred) {
    opts.logger?.warn("telegram.disabled", { reason: "no credentials in vault" });
    return undefined;
  }

  const bot = (opts.botFactory ?? ((token: string) => new Bot<Context>(token)))(cred.botToken);

  const adminChatIds = [cred.adminChatId, ...opts.config.adminChatIds];

  return new TelegramChannel({
    bot,
    approvals: opts.approvals,
    adminChatIds,
    dmSender: opts.dmSender,
    logger: opts.logger
  });
}
