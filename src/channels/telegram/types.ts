/**
 * Shared types for the Telegram channel (epic #47).
 *
 * The Telegram bot is openzigs-social's only push-notification + remote-control
 * channel. It surfaces approval requests as inline keyboards, relays DMs to
 * social platforms "as the user", and exposes a small admin command set behind
 * a deny-by-default ACL.
 */
import type { Logger } from "winston";

/**
 * Human-renderable approval payload. The {@link ApprovalQueue} is generic, so
 * the Telegram channel cannot assume a shape — but when a payload matches this
 * contract the channel renders a rich, readable card. Arbitrary payloads fall
 * back to a safe, truncated description (never raw secrets).
 */
export interface SocialApprovalPayload {
  /** Short category, e.g. `"reply"`, `"publish"`, `"dm"`. */
  kind?: string;
  /** Required one-line human summary shown in the approval message. */
  summary: string;
  /** Optional platform the action targets, e.g. `"instagram"`. */
  platform?: string;
  /** Optional longer body (draft text, etc.). Truncated when rendered. */
  detail?: string;
}

/** Narrow an unknown approval payload to {@link SocialApprovalPayload}. */
export function isSocialApprovalPayload(value: unknown): value is SocialApprovalPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { summary?: unknown }).summary === "string" &&
    (value as { summary: string }).summary.length > 0
  );
}

/** Minimal logger surface the channel depends on (Winston-compatible). */
export type ChannelLogger = Pick<Logger, "info" | "warn" | "error" | "debug">;

/** Resolved, non-secret runtime settings for the Telegram channel. */
export interface TelegramRuntimeConfig {
  /** Whether the channel should run at all. */
  enabled: boolean;
  /** Transport mode. Only `"polling"` is wired in v1. */
  mode: "polling" | "webhook";
  /**
   * Approval auto-decision timeout in ms. `0` (the default) means an approval
   * waits indefinitely for a human decision.
   */
  approvalTimeoutMs: number;
  /** Extra admin chat ids (the vault's primary admin is always allowed). */
  adminChatIds: string[];
}
