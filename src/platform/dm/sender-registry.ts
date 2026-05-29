/**
 * Outbound DM sender registry (#144, wiring the #51 port).
 *
 * The Telegram DM relay (#47/#51) depends only on the {@link SocialDmSender}
 * port — it sends a DM "as the user" without knowing which platform adapter
 * delivers it. This registry IS that port: it aggregates per-platform sender
 * adapters (Instagram, X, Bluesky, … built in the connector epics) and routes
 * each {@link SocialDmRequest} to the adapter that `supports()` its platform.
 *
 * Wiring it into `createTelegramChannelFromVault({ dmSender })` is what finally
 * lights up the relay end-to-end: typing a DM in Telegram now reaches a real
 * platform adapter (once one is registered) instead of degrading to
 * "unavailable".
 */
import type {
  SocialDmRequest,
  SocialDmResult,
  SocialDmSender
} from "../../channels/social/dm-sender.js";

/** A registry that is itself a {@link SocialDmSender}, delegating per platform. */
export class SocialDmSenderRegistry implements SocialDmSender {
  private readonly senders = new Map<string, SocialDmSender>();

  /**
   * Register an adapter for one platform. Throws on a duplicate platform so
   * misconfiguration surfaces at startup rather than silently shadowing.
   */
  register(platform: string, sender: SocialDmSender): void {
    const key = platform.toLowerCase();
    if (this.senders.has(key)) {
      throw new Error(`dm sender already registered for platform: ${key}`);
    }
    this.senders.set(key, sender);
  }

  /** Registered platform keys. */
  platforms(): string[] {
    return [...this.senders.keys()];
  }

  /** Whether some registered adapter can deliver to `platform`. */
  supports(platform: string): boolean {
    const sender = this.senders.get(platform.toLowerCase());
    return sender ? sender.supports(platform) : false;
  }

  /** Deliver via the adapter for the request's platform. Throws if none. */
  async sendDm(request: SocialDmRequest): Promise<SocialDmResult> {
    const sender = this.senders.get(request.platform.toLowerCase());
    if (!sender || !sender.supports(request.platform)) {
      throw new Error(`no DM sender registered for platform: ${request.platform}`);
    }
    return sender.sendDm(request);
  }
}
