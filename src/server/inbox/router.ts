/**
 * Unified inbox API router (epic #71 — #74/#76/#77).
 *
 * Routes (under `/api/inbox`):
 *   - GET    /threads                 — list threads (filters + search + priority sort)
 *   - GET    /threads/:id             — thread detail (DM + comment sections)
 *   - POST   /threads/:id/read        — mark a thread read
 *   - POST   /threads/:id/reply       — send a reply (DM via the #144 sender registry)
 *   - GET    /rules                   — list rules
 *   - POST   /rules                   — create a rule
 *   - PUT    /rules/:id               — update a rule
 *   - DELETE /rules/:id               — delete a rule
 *   - GET    /rules/:id/firings       — read a rule's audit trail
 *   - GET    /platform-limits         — per-platform reply constraints
 *
 * The reply DM-send path goes through the existing platform-service DM sender
 * registry (#144) — this router does NOT add a new send path. Every credential-
 * or DB-backed GET applies a 60-req/min/IP rate limiter (OWASP
 * `js/missing-rate-limiting`). All responses are flat JSON envelopes and never
 * echo token material.
 */
import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import type { SocialBrainRepository } from "../../platform/social-brain/repository.js";
import type { SocialDmSender } from "../../channels/social/dm-sender.js";
import { InboxRepository } from "../../inbox/repository.js";
import { RuleRepository, InvalidRuleError } from "../../inbox/rules/repository.js";
import { validateReply, PLATFORM_LIMITS, type ReplyKind } from "../../inbox/platform-limits.js";
import type { RuleInput } from "../../inbox/rules/types.js";
import type { Database } from "better-sqlite3";

export interface InboxRouterDeps {
  db: Database;
  brain: SocialBrainRepository;
  /** Outbound DM sender registry (#144). The reply path delegates to it. */
  dmSender: SocialDmSender;
  /** Socket.IO emit sink for `inbox:*` live updates. */
  emit?: (event: string, payload: unknown) => void;
}

function parseId(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function parseRuleInput(body: unknown): RuleInput {
  if (typeof body !== "object" || body === null) {
    throw new InvalidRuleError("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.trim().length === 0) {
    throw new InvalidRuleError("rule 'name' is required");
  }
  if (b.condition === undefined || b.actions === undefined) {
    throw new InvalidRuleError("rule requires 'condition' and 'actions'");
  }
  return {
    name: b.name,
    enabled: b.enabled === undefined ? undefined : Boolean(b.enabled),
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : undefined,
    // Structural validation (incl. operator allow-list) happens in the repo.
    condition: b.condition as RuleInput["condition"],
    actions: b.actions as RuleInput["actions"]
  };
}

/** Build the inbox router bound to the live DB + DM sender registry. */
export function createInboxRouter(deps: InboxRouterDeps): Router {
  const router = Router();
  const inbox = new InboxRepository(deps.db);
  const rules = new RuleRepository(deps.db);
  const emit = deps.emit ?? (() => undefined);

  // Mirror the connections router: 60 req/min/IP on the DB-backed reads.
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  // --- Threads -------------------------------------------------------------

  router.get("/threads", limiter, (req: Request, res: Response) => {
    const q = req.query;
    const limit = Math.min(Number(q.limit) || 50, 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const threads = inbox.listThreads({
      platform: typeof q.platform === "string" ? q.platform : undefined,
      contactId: typeof q.contactId === "string" ? parseId(q.contactId) : undefined,
      search: typeof q.search === "string" ? q.search : undefined,
      limit,
      offset
    });
    res.status(200).json({ timestamp: new Date().toISOString(), threads });
  });

  router.get("/threads/:id", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid thread id" });
      return;
    }
    const thread = inbox.getThread(id);
    if (!thread) {
      res.status(404).json({ error: "thread not found" });
      return;
    }
    res.status(200).json({ timestamp: new Date().toISOString(), thread });
  });

  router.post("/threads/:id/read", (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid thread id" });
      return;
    }
    if (!inbox.getThread(id)) {
      res.status(404).json({ error: "thread not found" });
      return;
    }
    inbox.markRead(id);
    emit("inbox:read", { threadId: id });
    res.status(200).json({ ok: true });
  });

  router.post("/threads/:id/reply", (req: Request, res: Response) => {
    void handleReply(req, res).catch(() => {
      if (!res.headersSent) res.status(500).json({ error: "reply failed" });
    });
  });

  async function handleReply(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid thread id" });
      return;
    }
    const thread = inbox.getThread(id);
    if (!thread) {
      res.status(404).json({ error: "thread not found" });
      return;
    }
    const body = req.body as { body?: unknown; kind?: unknown; mediaUrls?: unknown };
    const text = typeof body.body === "string" ? body.body : "";
    const mediaUrls = Array.isArray(body.mediaUrls)
      ? body.mediaUrls.filter((m): m is string => typeof m === "string")
      : [];
    // Default to DM when supported, else a comment reply.
    const kind: ReplyKind =
      body.kind === "comment" || body.kind === "dm"
        ? body.kind
        : thread.dmSupported
          ? "dm"
          : "comment";

    const validation = validateReply(thread.platform, kind, text, mediaUrls.length);
    if (!validation.ok) {
      res.status(422).json({ error: validation.reason });
      return;
    }

    if (kind === "dm") {
      const recipientId = thread.contact?.platformContactId;
      if (!recipientId) {
        res.status(422).json({ error: "thread has no resolvable DM recipient" });
        return;
      }
      if (!deps.dmSender.supports(thread.platform)) {
        res.status(422).json({ error: `no DM sender registered for ${thread.platform}` });
        return;
      }
      const result = await deps.dmSender.sendDm({
        platform: thread.platform,
        recipientId,
        text
      });
      const stored = deps.brain.upsertMessage({
        platform: thread.platform,
        platformMessageId: result.messageId ?? `local:${randomUUID()}`,
        threadId: thread.id,
        contactId: thread.contact?.id,
        direction: "outbound",
        body: text,
        metadata: { kind: "dm" },
        sentAt: new Date(result.deliveredAt).toISOString()
      });
      emit("inbox:reply", { threadId: thread.id, messageId: stored.id, delivered: true });
      res.status(200).json({ ok: true, delivered: true, message: stored });
      return;
    }

    // Comment replies have no connector publisher port in v1: record the reply
    // locally so the thread reflects it, and surface that it was not pushed.
    const stored = deps.brain.upsertMessage({
      platform: thread.platform,
      platformMessageId: `local:${randomUUID()}`,
      threadId: thread.id,
      contactId: thread.contact?.id,
      direction: "outbound",
      body: text,
      metadata: { kind: "comment" },
      sentAt: new Date().toISOString()
    });
    emit("inbox:reply", { threadId: thread.id, messageId: stored.id, delivered: false });
    res.status(200).json({ ok: true, delivered: false, recorded: true, message: stored });
  }

  // --- Rules ---------------------------------------------------------------

  router.get("/rules", limiter, (_req: Request, res: Response) => {
    res.status(200).json({ timestamp: new Date().toISOString(), rules: rules.list(true) });
  });

  router.post("/rules", (req: Request, res: Response) => {
    try {
      const rule = rules.create(parseRuleInput(req.body));
      res.status(201).json({ rule });
    } catch (err) {
      if (err instanceof InvalidRuleError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.put("/rules/:id", (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid rule id" });
      return;
    }
    try {
      const rule = rules.update(id, parseRuleInput(req.body));
      if (!rule) {
        res.status(404).json({ error: "rule not found" });
        return;
      }
      res.status(200).json({ rule });
    } catch (err) {
      if (err instanceof InvalidRuleError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete("/rules/:id", (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid rule id" });
      return;
    }
    if (rules.delete(id)) {
      res.status(200).json({ ok: true });
    } else {
      res.status(404).json({ error: "rule not found" });
    }
  });

  router.get("/rules/:id/firings", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid rule id" });
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.status(200).json({
      timestamp: new Date().toISOString(),
      firings: rules.listFirings(id, limit, offset)
    });
  });

  // --- Platform limits -----------------------------------------------------

  router.get("/platform-limits", limiter, (_req: Request, res: Response) => {
    res.status(200).json({ timestamp: new Date().toISOString(), limits: PLATFORM_LIMITS });
  });

  return router;
}
