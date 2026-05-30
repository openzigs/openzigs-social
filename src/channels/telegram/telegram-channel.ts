/**
 * TelegramChannel — grammy bot with inline approval keyboards, DM relay, and an
 * admin command set (epic #47).
 *
 * Responsibilities:
 *   - #48: own a grammy {@link Bot}, install the `@grammyjs/menu` queue menu,
 *     and run long-polling.
 *   - #50: subscribe to the shared {@link ApprovalQueue} `request` event and
 *     push an Approve / Reject inline keyboard to the admin chat(s); button
 *     clicks settle the approval via `ApprovalQueue.decide()`. Decision /
 *     timeout events edit the pushed messages to show the outcome.
 *   - #51: relay `/dm` commands through the {@link SocialDmSender} port.
 *   - #52: gate everything behind a deny-by-default admin ACL.
 *
 * The bot is injected (not constructed here) so tests can supply a {@link Bot}
 * wired with an API transformer that intercepts outgoing calls — no network is
 * ever required. `start()` is the only method that opens the network (polling).
 */
import type { Bot, Context } from "grammy";
import { Menu } from "@grammyjs/menu";

import type {
  ApprovalOutcome,
  ApprovalQueue,
  Decision,
  PendingApproval
} from "../../approvals/index.js";
import type { SocialDmSender } from "../social/dm-sender.js";
import { AdminAcl, createAclMiddleware, normalizeChatId } from "./acl.js";
import {
  buildApprovalKeyboard,
  parseApprovalCallbackData,
  renderApprovalMessage,
  truncate
} from "./approval-keyboard.js";
import { installCommands } from "./commands.js";
import { isSocialApprovalPayload, type ChannelLogger } from "./types.js";

/** Identifier for the pending-approvals menu (must be stable). */
export const QUEUE_MENU_ID = "oz-approval-queue";

/** Construction options for {@link TelegramChannel}. */
export interface TelegramChannelOptions {
  /** A grammy bot, already constructed with the bot token. */
  bot: Bot<Context>;
  /** The shared approval queue this channel renders. */
  approvals: ApprovalQueue;
  /** Admin chat ids allowed to command the bot and receive approval pushes. */
  adminChatIds: Iterable<number | string>;
  /** Optional outbound DM port (#127 implements it later). */
  dmSender?: SocialDmSender;
  logger?: ChannelLogger;
}

interface SentRef {
  chatId: string;
  messageId: number;
}

export class TelegramChannel {
  private readonly bot: Bot<Context>;
  private readonly approvals: ApprovalQueue;
  private readonly acl: AdminAcl;
  private readonly adminChatIds: string[];
  private readonly dmSender?: SocialDmSender;
  private readonly logger?: ChannelLogger;

  /** Pushed approval messages, keyed by approval id, for outcome edits. */
  private readonly sent = new Map<string, SentRef[]>();

  private registered = false;
  private started = false;

  private readonly onRequest = (pending: PendingApproval): void => {
    void this.pushApproval(pending);
  };
  private readonly onSettled = (outcome: ApprovalOutcome): void => {
    void this.renderOutcome(outcome);
  };

  constructor(opts: TelegramChannelOptions) {
    this.bot = opts.bot;
    this.approvals = opts.approvals;
    this.dmSender = opts.dmSender;
    this.logger = opts.logger;
    this.adminChatIds = [];
    for (const raw of opts.adminChatIds) {
      const id = normalizeChatId(raw);
      if (id !== undefined && !this.adminChatIds.includes(id)) this.adminChatIds.push(id);
    }
    this.acl = new AdminAcl(this.adminChatIds);
  }

  /**
   * Wire the ACL, menu, commands, callback routing, and approval subscriptions
   * onto the bot. Safe to call once; subsequent calls are no-ops.
   */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    // 1. Deny-by-default ACL runs before any handler.
    this.bot.use(createAclMiddleware(this.acl, this.logger));

    // 2. The interactive pending-approvals menu (#48 uses @grammyjs/menu).
    const queueMenu = this.buildQueueMenu();
    this.bot.use(queueMenu);

    // 3. Admin commands (#52).
    installCommands(this.bot, {
      approvals: this.approvals,
      queueMenu,
      dmSender: this.dmSender,
      botUsername: () => this.bot.botInfo?.username,
      logger: this.logger
    });

    // 4. Raw inline-keyboard approval callbacks (#50).
    this.bot.on("callback_query:data", async (ctx, next) => {
      const parsed = parseApprovalCallbackData(ctx.callbackQuery.data);
      if (!parsed) {
        await next();
        return;
      }
      await this.handleApprovalCallback(ctx, parsed.id, parsed.decision);
    });

    // 5. Bridge the shared approval queue to Telegram.
    this.approvals.on("request", this.onRequest);
    this.approvals.on("decision", this.onSettled);
    this.approvals.on("timeout", this.onSettled);
  }

  /** Register handlers (if needed) and begin long-polling. */
  async start(): Promise<void> {
    this.register();
    if (this.started) return;
    this.started = true;
    // grammy's start() resolves only when the bot stops; run it detached.
    void this.bot.start({
      onStart: (info) => {
        this.logger?.info("telegram.started", { username: info.username });
      }
    });
  }

  /** Stop polling and detach all approval-queue listeners. */
  async stop(): Promise<void> {
    this.approvals.off("request", this.onRequest);
    this.approvals.off("decision", this.onSettled);
    this.approvals.off("timeout", this.onSettled);
    if (this.started) {
      this.started = false;
      await this.bot.stop();
    }
  }

  /**
   * Broadcast a plain notification to every admin chat. Used by connectors
   * (e.g. the X write-quota guard, epic #66/#70) to push an out-of-band alert.
   * Best-effort: per-chat send failures are logged, never thrown.
   */
  async notify(text: string): Promise<void> {
    if (this.adminChatIds.length === 0) return;
    for (const chatId of this.adminChatIds) {
      try {
        await this.bot.api.sendMessage(chatId, text);
      } catch (err) {
        this.logger?.error("telegram.notify_failed", {
          chatId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  private buildQueueMenu(): Menu<Context> {
    const menu = new Menu<Context>(QUEUE_MENU_ID);
    menu.dynamic((_ctx, range) => {
      for (const pending of this.approvals.list()) {
        const label = truncate(this.summaryFor(pending), 28);
        range
          .text({ text: `✅ ${label}`, payload: pending.id }, async (ctx) => {
            const settled = this.decideFromMatch(ctx.match, "approve");
            await ctx.answerCallbackQuery({ text: settled ? "approved" : "Already handled" });
            ctx.menu.update();
          })
          .text({ text: "❌", payload: pending.id }, async (ctx) => {
            const settled = this.decideFromMatch(ctx.match, "reject");
            await ctx.answerCallbackQuery({ text: settled ? "rejected" : "Already handled" });
            ctx.menu.update();
          })
          .row();
      }
    });
    return menu;
  }

  private summaryFor(pending: PendingApproval): string {
    return isSocialApprovalPayload(pending.payload)
      ? pending.payload.summary
      : `approval ${pending.id.slice(0, 8)}`;
  }

  /** Decide an approval from a menu button payload (`ctx.match`). */
  private decideFromMatch(match: string | undefined, decision: Decision): boolean {
    const id = typeof match === "string" ? match : "";
    return id.length > 0 && this.approvals.decide(id, decision, { via: "telegram-menu" });
  }

  private async handleApprovalCallback(
    ctx: Context,
    id: string,
    decision: Decision
  ): Promise<void> {
    const settled = this.approvals.decide(id, decision, { via: "telegram-inline" });
    await ctx.answerCallbackQuery({ text: settled ? `${decision}d` : "Already handled" });
    if (!settled) {
      // Outcome already settled elsewhere; drop the stale keyboard.
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => undefined);
    }
  }

  private async pushApproval(pending: PendingApproval): Promise<void> {
    if (this.adminChatIds.length === 0) return;
    const text = renderApprovalMessage(pending);
    const keyboard = buildApprovalKeyboard(pending.id);
    const refs: SentRef[] = [];
    for (const chatId of this.adminChatIds) {
      try {
        const msg = await this.bot.api.sendMessage(chatId, text, {
          parse_mode: "HTML",
          reply_markup: keyboard
        });
        refs.push({ chatId, messageId: msg.message_id });
      } catch (err) {
        this.logger?.error("telegram.approval.push_failed", {
          chatId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    if (refs.length > 0) this.sent.set(pending.id, refs);
  }

  private async renderOutcome(outcome: ApprovalOutcome): Promise<void> {
    const refs = this.sent.get(outcome.id);
    if (!refs) return;
    this.sent.delete(outcome.id);
    const label =
      outcome.decision === "approve"
        ? "✅ Approved"
        : outcome.decision === "reject"
          ? "❌ Rejected"
          : "⌛ Timed out";
    for (const ref of refs) {
      await this.bot.api.editMessageText(ref.chatId, ref.messageId, label).catch(() => undefined);
    }
  }
}
