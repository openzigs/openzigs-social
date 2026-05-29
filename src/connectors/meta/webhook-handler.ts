/**
 * Meta webhook handler (#59).
 *
 * Implements the platform-service {@link WebhookHandler} port so the shared,
 * connector-agnostic webhook router (#140) can deliver Instagram / Facebook /
 * Threads events. The router owns the HTTP route, the GET verification
 * challenge, and the dedupe ledger; a connector supplies only:
 *
 *   - **verify** — constant-time HMAC over the raw body using the Meta app
 *     secret and the `X-Hub-Signature-256: sha256=<hex>` header (delegated to
 *     the platform's {@link verifySignature}).
 *   - **extractEventId** — a stable id from the `entry[]` so duplicate
 *     deliveries are no-ops.
 *   - **handle** — forward the verified event to the connector's processor.
 *
 * Realtime webhooks are the fast path; the polling scheduler (`scheduler.ts`)
 * is the fallback when webhooks are not configured or miss an event.
 *
 * Security: the app secret comes from the vault (BYOK) and is never logged; an
 * unsigned/mis-signed request is rejected (the router returns 401).
 */
import { verifySignature, type WebhookEvent, type WebhookHandler } from "../../platform/index.js";

const SIGNATURE_HEADER = "x-hub-signature-256";

interface MetaWebhookEntry {
  id?: string;
  time?: number;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

export interface MetaWebhookHandlerOptions {
  /** Lower-case platform key this handler serves, e.g. `"instagram"`. */
  platform: string;
  /** Meta app secret used to verify the HMAC signature (BYOK; never logged). */
  appSecret: string;
  /** Process a verified, de-duplicated event. */
  onEvent: (event: WebhookEvent) => Promise<void> | void;
}

/** Build a Meta {@link WebhookHandler} for one platform key. */
export function createMetaWebhookHandler(opts: MetaWebhookHandlerOptions): WebhookHandler {
  const platform = opts.platform.toLowerCase();
  return {
    platform,

    verify(rawBody: Buffer, headers: Record<string, string | undefined>): boolean {
      return verifySignature(rawBody, headers[SIGNATURE_HEADER], opts.appSecret, "sha256");
    },

    extractEventId(payload: unknown): string | undefined {
      const entries = (payload as MetaWebhookPayload | undefined)?.entry;
      if (!Array.isArray(entries) || entries.length === 0) return undefined;
      const parts = entries
        .map((e) => (e.id && e.time ? `${e.id}:${e.time}` : undefined))
        .filter((p): p is string => p !== undefined);
      return parts.length > 0 ? `${platform}:${parts.join(",")}` : undefined;
    },

    async handle(event: WebhookEvent): Promise<void> {
      await opts.onEvent(event);
    }
  };
}
