/**
 * Admin command handlers (epic #47, #52): `/start`, `/status`, `/privacy`,
 * `/queue`, and the `/dm` relay command.
 *
 * All commands run *after* the deny-by-default ACL middleware, so any handler
 * reached here is already known to be an authorised admin. Message text is
 * built by pure functions so the wording is unit-testable without a bot.
 */
import type { Bot, Context } from "grammy";
import type { Menu } from "@grammyjs/menu";

import type { ApprovalQueue } from "../../approvals/index.js";
import type { SocialDmSender } from "../social/dm-sender.js";
import { parseDmCommand, relayDm } from "./dm-relay.js";
import type { ChannelLogger } from "./types.js";

/** Dependencies the command handlers need. */
export interface CommandDeps {
  approvals: ApprovalQueue;
  /** Interactive menu listing pending approvals (rendered by `/queue`). */
  queueMenu: Menu<Context>;
  dmSender?: SocialDmSender;
  /** Resolves the connected bot username (for `/start`), when known. */
  botUsername?: () => string | undefined;
  logger?: ChannelLogger;
}

/** Greeting shown by `/start`. */
export function buildStartMessage(botUsername?: string): string {
  const who = botUsername ? `@${botUsername}` : "openzigs-social";
  return [
    `👋 ${who} is your openzigs-social remote control.`,
    "",
    "Commands:",
    "• /status — channel + approval status",
    "• /queue — review pending approvals",
    "• /privacy — what this bot can see and store",
    "• /dm <platform> <recipient> <message> — send a DM as you"
  ].join("\n");
}

/** Status summary shown by `/status`. */
export function buildStatusMessage(input: {
  pendingApprovals: number;
  dmAvailable: boolean;
}): string {
  return [
    "<b>openzigs-social status</b>",
    `• Pending approvals: ${input.pendingApprovals}`,
    `• DM relay: ${input.dmAvailable ? "available" : "no platform connected"}`
  ].join("\n");
}

/** Privacy posture shown by `/privacy`. */
export function buildPrivacyMessage(): string {
  return [
    "<b>Privacy</b>",
    "",
    "• openzigs-social runs locally on your machine; the default LLM is local.",
    "• Your Telegram bot token and admin chat id are stored encrypted in the",
    "  local credential vault (AES-256-GCM, file mode 0600) — never in logs.",
    "• This bot only obeys your configured admin chat. All other chats are",
    "  ignored.",
    "• Approval decisions and DM relays you trigger here are recorded in the",
    "  local audit log; message bodies are not sent to any third party beyond",
    "  the platform you explicitly target."
  ].join("\n");
}

/** Usage help for the `/dm` command. */
export function buildDmUsage(reason: string): string {
  return [`⚠️ ${reason}`, "", "Usage: /dm <platform> <recipient> <message>"].join("\n");
}

/**
 * Install the admin command handlers on the bot. Idempotent per bot instance is
 * the caller's responsibility (call once during channel setup).
 */
export function installCommands(bot: Bot<Context>, deps: CommandDeps): void {
  const { approvals, queueMenu, dmSender, botUsername, logger } = deps;

  bot.command("start", async (ctx) => {
    await ctx.reply(buildStartMessage(botUsername?.()));
  });

  bot.command("status", async (ctx) => {
    await ctx.reply(
      buildStatusMessage({
        pendingApprovals: approvals.size,
        dmAvailable: dmSender !== undefined
      }),
      { parse_mode: "HTML" }
    );
  });

  bot.command("privacy", async (ctx) => {
    await ctx.reply(buildPrivacyMessage(), { parse_mode: "HTML" });
  });

  bot.command("queue", async (ctx) => {
    if (approvals.size === 0) {
      await ctx.reply("✅ No pending approvals.");
      return;
    }
    await ctx.reply(`<b>Pending approvals (${approvals.size})</b>`, {
      parse_mode: "HTML",
      reply_markup: queueMenu
    });
  });

  bot.command("dm", async (ctx) => {
    const parsed = parseDmCommand(ctx.match ?? "");
    if (!parsed.ok) {
      await ctx.reply(buildDmUsage(parsed.reason));
      return;
    }
    const outcome = await relayDm(dmSender, parsed.request);
    if (outcome.ok) {
      logger?.info("telegram.dm.relayed", {
        platform: parsed.request.platform,
        recipientId: parsed.request.recipientId
      });
      await ctx.reply(`📤 Sent DM on ${parsed.request.platform} to ${parsed.request.recipientId}.`);
    } else {
      await ctx.reply(`⚠️ Could not send DM: ${outcome.reason}`);
    }
  });
}
