/**
 * Outbound social-platform DM port.
 *
 * This is a **port** (interface), not an implementation. The Telegram remote-
 * control DM relay (epic #47, #51) lets the user send a direct message on a
 * connected social platform "as themselves" by typing it into the Telegram
 * bot. The relay does not know — and must not care — how a DM is actually
 * delivered; it depends only on this narrow contract.
 *
 * The concrete implementation is owned by the platform-service epic (#127),
 * which will register real adapters (Instagram, X, Bluesky, …) behind this
 * port. Until then the relay degrades gracefully: when no sender is wired (or
 * the sender does not `support()` the requested platform) the relay reports
 * that DM delivery is unavailable instead of pretending to send.
 *
 * Keeping this an interface here means the relay logic — and its tests — can
 * be written and verified now without any network access or fake platform
 * stubs.
 */

/** A request to deliver a direct message on a social platform. */
export interface SocialDmRequest {
  /** Platform key, e.g. `"instagram"`, `"x"`, `"bluesky"`. Lower-case. */
  platform: string;
  /** Platform-native recipient identifier (handle or id). */
  recipientId: string;
  /** Message body to deliver. */
  text: string;
}

/** Result of a successful DM delivery. */
export interface SocialDmResult {
  /** Platform the message was delivered on. */
  platform: string;
  /** Recipient the message was delivered to. */
  recipientId: string;
  /** Platform-native id of the sent message, when the adapter returns one. */
  messageId?: string;
  /** Unix epoch ms when the adapter confirmed delivery. */
  deliveredAt: number;
}

/**
 * Outbound DM port implemented by the platform service (#127).
 *
 * Implementations MUST:
 *   - reject (throw) on a delivery failure so the relay can report it; and
 *   - return a {@link SocialDmResult} only when the platform confirms the send.
 */
export interface SocialDmSender {
  /** Whether this sender can deliver to the given platform key. */
  supports(platform: string): boolean;
  /** Deliver a direct message. Throws on failure. */
  sendDm(request: SocialDmRequest): Promise<SocialDmResult>;
}
