/**
 * Webhook handler registry (#140).
 *
 * Each connector registers a {@link WebhookHandler} keyed by its lower-case
 * platform name. The handler declares how to verify the signature, how to pull
 * a stable event id out of the payload (for dedupe), and what to do with a
 * verified event. The router is connector-agnostic and dispatches purely
 * through this port, so connector epics (#53/#60/#66) plug in without touching
 * the platform-service layer.
 */

/** A verified, parsed webhook event handed to a handler. */
export interface WebhookEvent {
  platform: string;
  /** Stable per-event id used for de-duplication, when available. */
  eventId?: string;
  /** Parsed JSON payload. */
  payload: unknown;
  /** Lower-cased request headers. */
  headers: Record<string, string | undefined>;
  /** Exact bytes received (already signature-verified). */
  rawBody: Buffer;
}

/** Port a connector implements to receive its platform's webhooks. */
export interface WebhookHandler {
  /** Lower-case platform key, e.g. `"instagram"`. */
  readonly platform: string;
  /**
   * Verify the request signature against the raw body. Implementations should
   * use {@link verifySignature} (constant-time). Return false to reject (401).
   */
  verify(rawBody: Buffer, headers: Record<string, string | undefined>): boolean;
  /**
   * Extract a stable event id from the parsed payload/headers for dedupe.
   * Return `undefined` when the platform provides none (event is processed
   * every delivery).
   */
  extractEventId?(
    payload: unknown,
    headers: Record<string, string | undefined>
  ): string | undefined;
  /** Process a verified, de-duplicated event. Throwing yields a 500. */
  handle(event: WebhookEvent): Promise<void> | void;
}

const PLATFORM_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export class WebhookHandlerRegistry {
  private readonly handlers = new Map<string, WebhookHandler>();

  register(handler: WebhookHandler): void {
    const platform = handler.platform.toLowerCase();
    if (!PLATFORM_RE.test(platform)) {
      throw new Error(`invalid platform key: ${handler.platform}`);
    }
    if (this.handlers.has(platform)) {
      throw new Error(`handler already registered for platform: ${platform}`);
    }
    this.handlers.set(platform, handler);
  }

  has(platform: string): boolean {
    return this.handlers.has(platform.toLowerCase());
  }

  get(platform: string): WebhookHandler | undefined {
    return this.handlers.get(platform.toLowerCase());
  }

  platforms(): string[] {
    return [...this.handlers.keys()];
  }
}
