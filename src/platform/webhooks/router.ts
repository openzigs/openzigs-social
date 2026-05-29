/**
 * Webhook receiver router (#140).
 *
 * Mounts at `/webhooks`, exposing `POST /:platform`.
 *
 * Flow:
 *   1. Resolve the handler for `:platform` (404 if unknown — no internals leaked).
 *   2. Capture the raw body and verify the HMAC signature (401 on missing/invalid).
 *   3. Parse JSON (400 on malformed payload).
 *   4. De-duplicate by `(platform, eventId)` via the event store (200 ack on replay).
 *   5. Dispatch to the handler; ack 200 on success, 500 on handler error.
 *
 * Security (OWASP):
 *   - Signature is verified against the EXACT raw bytes with a constant-time
 *     compare before any parsing, so unsigned/forged payloads never reach a
 *     handler. Bad/missing signatures get a bare 401 with no body echo.
 *   - The request body is never reflected in responses or logs.
 *   - A per-request body size cap mitigates DoS via oversized payloads.
 */
import { Router, type Request, type Response, raw } from "express";

import type { WebhookEventStore } from "./event-store.js";
import type { WebhookHandlerRegistry } from "./handler-registry.js";

/** Structured logger surface (a subset of the app logger). */
export interface WebhookLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface WebhookRouterDeps {
  registry: WebhookHandlerRegistry;
  eventStore: WebhookEventStore;
  logger?: WebhookLogger;
  /** Max accepted body size in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
}

function lowerHeaders(req: Request): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
  }
  return out;
}

/** Build the webhook receiver router. */
export function createWebhookRouter(deps: WebhookRouterDeps): Router {
  const router = Router();
  const limit = deps.maxBodyBytes ?? 1024 * 1024;

  // Capture the raw bytes for every content type so HMAC verification runs on
  // exactly what the platform signed.
  router.use(raw({ type: () => true, limit }));

  router.post("/:platform", (req: Request, res: Response): void => {
    void (async () => {
      const platform = String(req.params.platform ?? "").toLowerCase();

      const handler = deps.registry.get(platform);
      if (!handler) {
        res.status(404).json({ error: "unknown platform" });
        return;
      }

      const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const headers = lowerHeaders(req);

      // 2. Verify signature before doing anything with the body.
      if (!handler.verify(rawBody, headers)) {
        deps.logger?.warn({ platform }, "webhook rejected: invalid signature");
        res.status(401).json({ error: "invalid signature" });
        return;
      }

      // 3. Parse JSON now that authenticity is established.
      let payload: unknown;
      try {
        payload = rawBody.length > 0 ? JSON.parse(rawBody.toString("utf8")) : {};
      } catch {
        res.status(400).json({ error: "invalid payload" });
        return;
      }

      // 4. De-duplicate replays.
      const eventId = handler.extractEventId?.(payload, headers);
      if (typeof eventId === "string" && eventId.length > 0) {
        const isNew = deps.eventStore.recordIfNew(platform, eventId);
        if (!isNew) {
          res.status(200).json({ ok: true, duplicate: true });
          return;
        }
      }

      // 5. Dispatch.
      try {
        await handler.handle({ platform, eventId, payload, headers, rawBody });
      } catch (err) {
        deps.logger?.error(
          { platform, err: err instanceof Error ? err.message : "error" },
          "webhook handler failed"
        );
        res.status(500).json({ error: "handler error" });
        return;
      }

      res.status(200).json({ ok: true });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  return router;
}
