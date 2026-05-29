/**
 * Inline approval keyboard + callback routing (epic #47, #50).
 *
 * The Telegram channel renders pending {@link ApprovalQueue} requests as
 * inline keyboards with Approve / Reject buttons. Clicking a button settles the
 * awaiting approval via `ApprovalQueue.decide(id, "approve" | "reject")`. There
 * is exactly **one** approval system in the app (the shared `ApprovalQueue`);
 * this module is only the Telegram rendering + button-routing layer on top of
 * it.
 *
 * Callback data is a compact, fixed-shape string (`oz:appr:<decision>:<id>`)
 * kept well under Telegram's 64-byte limit, parsed defensively so a malformed
 * or hostile callback never throws or mis-routes.
 */
import { InlineKeyboard } from "grammy";

import type { Decision, PendingApproval } from "../../approvals/index.js";
import { isSocialApprovalPayload } from "./types.js";

/** Namespaced prefix for approval callback data. */
export const APPROVAL_CALLBACK_PREFIX = "oz:appr";

/** Max characters of free-form detail rendered into an approval message. */
export const MAX_DETAIL_CHARS = 500;

/** A parsed approval callback. */
export interface ApprovalCallback {
  decision: Decision;
  id: string;
}

/** Build the callback data string for a decision button. */
export function buildApprovalCallbackData(decision: Decision, id: string): string {
  return `${APPROVAL_CALLBACK_PREFIX}:${decision}:${id}`;
}

/**
 * Parse approval callback data. Returns `null` for anything that is not a
 * well-formed approval callback (wrong prefix, unknown decision, missing id),
 * so callers can ignore foreign or malformed callbacks safely.
 */
export function parseApprovalCallbackData(data: string | undefined): ApprovalCallback | null {
  if (typeof data !== "string") return null;
  if (!data.startsWith(`${APPROVAL_CALLBACK_PREFIX}:`)) return null;
  const rest = data.slice(APPROVAL_CALLBACK_PREFIX.length + 1);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const decision = rest.slice(0, sep);
  const id = rest.slice(sep + 1);
  if (decision !== "approve" && decision !== "reject") return null;
  if (id.length === 0) return null;
  return { decision, id };
}

/** Build the Approve / Reject inline keyboard for a single pending approval. */
export function buildApprovalKeyboard(id: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Approve", buildApprovalCallbackData("approve", id))
    .text("❌ Reject", buildApprovalCallbackData("reject", id));
}

/** Escape the small set of HTML characters Telegram's HTML parse mode cares about. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Truncate a string to `max` chars, appending an ellipsis when clipped. */
export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * Render a human-readable approval message. Recognised
 * {@link SocialApprovalPayload}s get a rich card; any other payload is rendered
 * as a safe, length-bounded JSON preview (never raw secret material — the
 * payload author is responsible for not putting secrets in approval payloads,
 * and we additionally bound the length).
 */
export function renderApprovalMessage(pending: PendingApproval): string {
  const lines: string[] = ["<b>Approval required</b>"];
  const payload = pending.payload;

  if (isSocialApprovalPayload(payload)) {
    if (payload.kind) lines.push(`Action: ${escapeHtml(payload.kind)}`);
    if (payload.platform) lines.push(`Platform: ${escapeHtml(payload.platform)}`);
    lines.push("", escapeHtml(payload.summary));
    if (payload.detail) {
      lines.push("", `<i>${escapeHtml(truncate(payload.detail, MAX_DETAIL_CHARS))}</i>`);
    }
  } else {
    let preview: string;
    try {
      preview = JSON.stringify(payload);
    } catch {
      preview = String(payload);
    }
    lines.push(
      "",
      `<code>${escapeHtml(truncate(preview ?? "(no detail)", MAX_DETAIL_CHARS))}</code>`
    );
  }

  return lines.join("\n");
}
