/**
 * Outbox API router (epic #84 — #85/#87/#88).
 *
 * Routes (under `/api/outbox`):
 *   - GET    /                 — list posts (status/platform/date-range filters)
 *   - GET    /post-limits      — per-platform composer limits (#87)
 *   - GET    /dlq              — dead-lettered publishes (#89 failure surfacing)
 *   - GET    /:id              — post detail
 *   - POST   /                 — create a draft or scheduled post
 *   - PUT    /:id              — edit body/media/account of a draft/scheduled/failed post
 *   - POST   /:id/schedule     — schedule a draft (draft → scheduled)
 *   - POST   /:id/reschedule   — drag-to-reschedule (#88): moves publish_at, keeps platform
 *   - POST   /:id/retry        — requeue a failed post (failed → scheduled)
 *   - DELETE /:id              — delete a post
 *
 * Per-platform limits ({@link validatePost}) are enforced HERE on create/update
 * so an over-limit X post (>280 chars) is rejected server-side even if the
 * browser composer is bypassed. Reschedule never accepts a platform field — the
 * platform is immutable once a post exists. Every handler — reads AND mutations
 * — applies a 60-req/min/IP rate limiter (OWASP `js/missing-rate-limiting`).
 * Responses are flat JSON envelopes; the outbox holds no credentials.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import type { Database } from "better-sqlite3";

import type { DlqRepository } from "../../platform/retry/dlq.js";
import { POST_LIMITS, validatePost, type PostMedia } from "../../outbox/post-limits.js";
import {
  IllegalTransitionError,
  OutboxNotFoundError,
  OutboxRepository,
  type OutboxMedia,
  type OutboxStatus
} from "../../outbox/repository.js";

const VALID_STATUSES: readonly OutboxStatus[] = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed"
];

export interface OutboxRouterDeps {
  db: Database;
  /** Dead-letter repository (#89) for surfacing terminal publish failures. */
  dlq: DlqRepository;
  /** Socket.IO emit sink for `outbox:*` live updates. */
  emit?: (event: string, payload: unknown) => void;
}

function parseId(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function parseStatusFilter(raw: unknown): OutboxStatus[] | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const parts = raw.split(",").map((s) => s.trim());
  const valid = parts.filter((s): s is OutboxStatus => VALID_STATUSES.includes(s as OutboxStatus));
  return valid.length > 0 ? valid : undefined;
}

function parseEpoch(raw: unknown): number | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseMedia(raw: unknown): OutboxMedia[] {
  if (!Array.isArray(raw)) return [];
  const media: OutboxMedia[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    if (typeof m.url !== "string" || typeof m.type !== "string") continue;
    const entry: OutboxMedia = { url: m.url, type: m.type };
    if (typeof m.altText === "string") entry.altText = m.altText;
    if (typeof m.bytes === "number") entry.bytes = m.bytes;
    media.push(entry);
  }
  return media;
}

/** Build the outbox router bound to the live DB + DLQ. */
export function createOutboxRouter(deps: OutboxRouterDeps): Router {
  const router = Router();
  const repo = new OutboxRepository(deps.db);
  const emit = deps.emit ?? (() => undefined);

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  // --- Reads ---------------------------------------------------------------

  router.get("/", limiter, (req: Request, res: Response) => {
    const q = req.query;
    const status = parseStatusFilter(q.status);
    repoList(res, status, q);
  });

  function repoList(res: Response, status: OutboxStatus[] | undefined, q: Request["query"]): void {
    const posts = repo.list({
      status,
      platform: typeof q.platform === "string" ? q.platform : undefined,
      from: parseEpoch(q.from),
      to: parseEpoch(q.to),
      limit: Math.min(Number(q.limit) || 200, 500),
      offset: Math.max(Number(q.offset) || 0, 0)
    });
    res.status(200).json({ timestamp: new Date().toISOString(), posts });
  }

  router.get("/post-limits", limiter, (_req: Request, res: Response) => {
    res.status(200).json({ timestamp: new Date().toISOString(), limits: POST_LIMITS });
  });

  router.get("/dlq", limiter, (req: Request, res: Response) => {
    const q = req.query;
    const entries = deps.dlq.list({
      platform: typeof q.platform === "string" ? q.platform : undefined,
      limit: Math.min(Number(q.limit) || 100, 200),
      offset: Math.max(Number(q.offset) || 0, 0)
    });
    res.status(200).json({ timestamp: new Date().toISOString(), entries });
  });

  router.get("/:id", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid post id" });
      return;
    }
    const post = repo.get(id);
    if (!post) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    res.status(200).json({ timestamp: new Date().toISOString(), post });
  });

  // --- Mutations -----------------------------------------------------------

  router.post("/", limiter, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    if (typeof body.platform !== "string" || body.platform.trim().length === 0) {
      res.status(400).json({ error: "'platform' is required" });
      return;
    }
    const text = typeof body.body === "string" ? body.body : "";
    const media = parseMedia(body.media);
    const publishAt = parseEpoch(body.publishAt);

    const validation = validatePost(body.platform, text, media as PostMedia[]);
    if (!validation.ok) {
      res.status(422).json({ error: validation.reason });
      return;
    }

    const created = repo.create({
      platform: body.platform,
      accountId: typeof body.accountId === "string" ? body.accountId : undefined,
      body: text,
      media,
      publishAt
    });
    emit("outbox:created", { id: created.id, status: created.status, platform: created.platform });
    res.status(201).json({ post: created });
  });

  router.put("/:id", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid post id" });
      return;
    }
    const existing = repo.get(id);
    if (!existing) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body : existing.body;
    const media = body.media !== undefined ? parseMedia(body.media) : existing.media;

    const validation = validatePost(existing.platform, text, media as PostMedia[]);
    if (!validation.ok) {
      res.status(422).json({ error: validation.reason });
      return;
    }
    try {
      const updated = repo.update(id, {
        body: text,
        media,
        accountId: typeof body.accountId === "string" ? body.accountId : undefined
      });
      emit("outbox:updated", { id: updated.id, status: updated.status });
      res.status(200).json({ post: updated });
    } catch (err) {
      sendTransitionError(res, err);
    }
  });

  router.post("/:id/schedule", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid post id" });
      return;
    }
    const publishAt = parseEpoch((req.body as Record<string, unknown>).publishAt);
    if (publishAt === undefined) {
      res.status(400).json({ error: "'publishAt' (epoch ms) is required" });
      return;
    }
    if (!repo.get(id)) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    try {
      const scheduled = repo.schedule(id, publishAt);
      emit("outbox:scheduled", { id: scheduled.id, publishAt: scheduled.publishAt });
      res.status(200).json({ post: scheduled });
    } catch (err) {
      sendTransitionError(res, err);
    }
  });

  router.post("/:id/reschedule", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid post id" });
      return;
    }
    const publishAt = parseEpoch((req.body as Record<string, unknown>).publishAt);
    if (publishAt === undefined) {
      res.status(400).json({ error: "'publishAt' (epoch ms) is required" });
      return;
    }
    if (!repo.get(id)) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    try {
      // Platform is intentionally not read from the body — it is immutable.
      const moved = repo.reschedule(id, publishAt);
      emit("outbox:rescheduled", {
        id: moved.id,
        publishAt: moved.publishAt,
        platform: moved.platform
      });
      res.status(200).json({ post: moved });
    } catch (err) {
      sendTransitionError(res, err);
    }
  });

  router.post("/:id/retry", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid post id" });
      return;
    }
    if (!repo.get(id)) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    const publishAt = parseEpoch((req.body as Record<string, unknown>).publishAt);
    try {
      const retried = publishAt === undefined ? repo.retry(id) : repo.retry(id, publishAt);
      emit("outbox:retried", { id: retried.id, publishAt: retried.publishAt });
      res.status(200).json({ post: retried });
    } catch (err) {
      sendTransitionError(res, err);
    }
  });

  router.delete("/:id", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid post id" });
      return;
    }
    const removed = repo.delete(id);
    if (!removed) {
      res.status(404).json({ error: "post not found" });
      return;
    }
    emit("outbox:deleted", { id });
    res.status(200).json({ ok: true });
  });

  return router;
}

function sendTransitionError(res: Response, err: unknown): void {
  if (err instanceof IllegalTransitionError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof OutboxNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  throw err;
}
