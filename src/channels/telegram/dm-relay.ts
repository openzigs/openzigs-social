/**
 * DM relay: Telegram message → social-platform DM "as the user" (epic #47, #51).
 *
 * The user issues `/dm <platform> <recipient> <message…>` to the bot and the
 * relay delivers it on the connected social platform through the
 * {@link SocialDmSender} port. The platform adapters that implement that port
 * are owned by the platform-service epic (#127) and do not exist yet, so the
 * relay degrades cleanly: when no sender is wired — or it does not support the
 * requested platform — the relay reports "unavailable" instead of pretending
 * to send. There are deliberately **no fake network calls** here.
 *
 * Parsing is a pure function so it can be exhaustively unit-tested without a
 * bot or a network.
 */
import type { SocialDmRequest, SocialDmResult, SocialDmSender } from "../social/dm-sender.js";

/** Result of parsing a `/dm` command. */
export type ParsedDmCommand =
  | { ok: true; request: SocialDmRequest }
  | { ok: false; reason: string };

/** Result of attempting to relay a DM. */
export type RelayResult = { ok: true; result: SocialDmResult } | { ok: false; reason: string };

/** Lower-case platform keys must be short, alphanumeric (plus `-`/`_`). */
const PLATFORM_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const MAX_MESSAGE_CHARS = 4096;

/**
 * Parse a `/dm` command body. Accepts either the full command (`/dm …`) or the
 * already-stripped argument string. Shape: `<platform> <recipient> <message…>`.
 *
 * Returns a structured failure (never throws) describing what was missing so
 * the channel can reply with usage help.
 */
export function parseDmCommand(input: string): ParsedDmCommand {
  let text = input.trim();
  if (text.startsWith("/dm")) {
    text = text.slice(3).trim();
  }
  if (text.length === 0) {
    return { ok: false, reason: "usage: /dm <platform> <recipient> <message>" };
  }

  const firstSpace = text.indexOf(" ");
  if (firstSpace < 0) {
    return { ok: false, reason: "missing recipient and message" };
  }
  const platform = text.slice(0, firstSpace).trim().toLowerCase();
  const afterPlatform = text.slice(firstSpace + 1).trim();

  const secondSpace = afterPlatform.indexOf(" ");
  if (secondSpace < 0) {
    return { ok: false, reason: "missing message" };
  }
  const recipientId = afterPlatform.slice(0, secondSpace).trim();
  const message = afterPlatform.slice(secondSpace + 1).trim();

  if (!PLATFORM_RE.test(platform)) {
    return { ok: false, reason: "invalid platform name" };
  }
  if (recipientId.length === 0) {
    return { ok: false, reason: "missing recipient" };
  }
  if (message.length === 0) {
    return { ok: false, reason: "missing message" };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, reason: `message too long (max ${MAX_MESSAGE_CHARS} characters)` };
  }

  return { ok: true, request: { platform, recipientId, text: message } };
}

/**
 * Relay a parsed DM request through the sender port. Never throws: a missing
 * sender, unsupported platform, or adapter failure is returned as a structured
 * `{ ok: false, reason }`.
 */
export async function relayDm(
  sender: SocialDmSender | undefined,
  request: SocialDmRequest
): Promise<RelayResult> {
  if (!sender || !sender.supports(request.platform)) {
    return { ok: false, reason: `no connected platform can send DMs on "${request.platform}"` };
  }
  try {
    const result = await sender.sendDm(request);
    return { ok: true, result };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown delivery error";
    return { ok: false, reason };
  }
}
