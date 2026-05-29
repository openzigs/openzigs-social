/**
 * Admin-chat access control (epic #47, #52).
 *
 * The Telegram bot is a remote control for the user's own account, so it must
 * be **deny-by-default**: only explicitly allow-listed chat ids may run
 * commands, decide approvals, or relay DMs. Every other update is ignored —
 * no command execution, no data leakage, not even an error reply that would
 * confirm the bot exists.
 */
import type { Context, MiddlewareFn } from "grammy";

import type { ChannelLogger } from "./types.js";

/**
 * Normalise a chat/user id (number or string) to a trimmed string for
 * comparison. Returns `undefined` for empty / nullish input so it can never
 * accidentally match an empty allow-list entry.
 */
export function normalizeChatId(id: number | string | undefined | null): string | undefined {
  if (id === undefined || id === null) return undefined;
  const s = String(id).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * Immutable allow-list of admin chat ids. Built once at channel start from the
 * vault's primary admin chat id plus any extras from config. Empty set ⇒ the
 * bot accepts no commands from anyone (safe default).
 */
export class AdminAcl {
  private readonly ids: ReadonlySet<string>;

  constructor(ids: Iterable<number | string>) {
    const normalized = new Set<string>();
    for (const raw of ids) {
      const id = normalizeChatId(raw);
      if (id !== undefined) normalized.add(id);
    }
    this.ids = normalized;
  }

  /** Whether the given chat id is an allow-listed admin. */
  isAdmin(chatId: number | string | undefined | null): boolean {
    const id = normalizeChatId(chatId);
    if (id === undefined) return false;
    return this.ids.has(id);
  }

  /** Number of configured admin ids (mostly for tests / observability). */
  get size(): number {
    return this.ids.size;
  }
}

/**
 * grammy middleware that gates every update on {@link AdminAcl}. Runs first in
 * the middleware stack so non-admin updates never reach command, callback, or
 * relay handlers. Denials are logged (chat id only — never message content) and
 * silently dropped.
 */
export function createAclMiddleware(acl: AdminAcl, logger?: ChannelLogger): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (acl.isAdmin(chatId)) {
      await next();
      return;
    }
    logger?.warn("telegram.acl.denied", {
      chatId: normalizeChatId(chatId) ?? "unknown",
      updateType: ctx.update.callback_query ? "callback_query" : "message"
    });
    // Deny-by-default: drop the update. Do not reply — no existence leak.
  };
}
