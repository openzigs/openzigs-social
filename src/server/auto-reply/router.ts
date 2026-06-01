/**
 * Auto-reply / brand-voice API router (epic #78 — #79/#81/#82/#83).
 *
 * Routes (under `/api/auto-reply`):
 *   - GET    /config     — current Hybrid posture + thresholds (read-only)
 *   - GET    /rulebook   — the workspace brand-voice rulebook
 *   - PUT    /rulebook   — replace the brand-voice rulebook
 *   - POST   /score      — score an ad-hoc draft against the live rulebook
 *   - POST   /evaluate   — run the full pipeline on a draft (score+route+audit)
 *   - POST   /audit/:id/resolve — approve/reject a queued draft
 *   - GET    /audit      — list audit rows (by thread + time range)
 *
 * Every handler applies a 60-req/min/IP rate limiter (OWASP
 * `js/missing-rate-limiting`). All responses are flat JSON envelopes. Input is
 * validated at the boundary; the rulebook editor never trusts client shapes.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import { scoreVoice } from "../../personality/profiler.js";
import type { BrandVoiceRepository } from "../../personality/rulebook-repository.js";
import type { BrandVoiceRulebook } from "../../personality/types.js";
import type { AutoReplyAuditRepository } from "../../routing/audit-repository.js";
import { AutoReplyPipeline, AutoReplyResolveError } from "../../routing/pipeline.js";
import type { RoutingThresholds } from "../../routing/types.js";

export interface AutoReplyRouterDeps {
  rulebook: BrandVoiceRepository;
  audit: AutoReplyAuditRepository;
  pipeline: AutoReplyPipeline;
  /** Read fresh per request so a config reload is honoured. */
  thresholds: () => RoutingThresholds;
  /** Hybrid master switch. */
  enabled: () => boolean;
}

/** Parse a positive-integer route/query id, or `undefined` when invalid. */
function parseId(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Coerce an unknown into a list of strings (drops non-strings). */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** Validate + shape a rulebook from an untrusted request body. */
function parseRulebook(body: unknown): BrandVoiceRulebook {
  if (typeof body !== "object" || body === null) {
    throw new TypeError("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  if (b.tone !== undefined && typeof b.tone !== "string") {
    throw new TypeError("'tone' must be a string");
  }
  if (b.bannedWords !== undefined && !Array.isArray(b.bannedWords)) {
    throw new TypeError("'bannedWords' must be an array of strings");
  }
  if (b.exemplars !== undefined && !Array.isArray(b.exemplars)) {
    throw new TypeError("'exemplars' must be an array of strings");
  }
  return {
    tone: typeof b.tone === "string" ? b.tone : "",
    bannedWords: toStringList(b.bannedWords),
    exemplars: toStringList(b.exemplars)
  };
}

/** Build the auto-reply router bound to the live repositories + pipeline. */
export function createAutoReplyRouter(deps: AutoReplyRouterDeps): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  const envelope = (extra: Record<string, unknown>): Record<string, unknown> => ({
    timestamp: new Date().toISOString(),
    ...extra
  });

  // --- Config --------------------------------------------------------------

  router.get("/config", limiter, (_req: Request, res: Response) => {
    res.status(200).json(envelope({ enabled: deps.enabled(), thresholds: deps.thresholds() }));
  });

  // --- Rulebook ------------------------------------------------------------

  router.get("/rulebook", limiter, (_req: Request, res: Response) => {
    res.status(200).json(envelope({ rulebook: deps.rulebook.get() }));
  });

  router.put("/rulebook", limiter, (req: Request, res: Response) => {
    let input: BrandVoiceRulebook;
    try {
      input = parseRulebook(req.body);
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
      return;
    }
    const rulebook = deps.rulebook.save(input);
    res.status(200).json(envelope({ rulebook }));
  });

  // --- Scoring -------------------------------------------------------------

  router.post("/score", limiter, (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.draft !== "string" || body.draft.trim().length === 0) {
      res.status(422).json({ error: "'draft' is required" });
      return;
    }
    const voice = scoreVoice(body.draft, deps.rulebook.get());
    res.status(200).json(envelope({ voice }));
  });

  // --- Pipeline evaluate ---------------------------------------------------

  router.post("/evaluate", limiter, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.draft !== "string" || body.draft.trim().length === 0) {
      res.status(422).json({ error: "'draft' is required" });
      return;
    }
    if (typeof body.prompt !== "string") {
      res.status(422).json({ error: "'prompt' is required" });
      return;
    }
    if (typeof body.threadId !== "string" || body.threadId.trim().length === 0) {
      res.status(422).json({ error: "'threadId' is required" });
      return;
    }
    const confidence = Number(body.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      res.status(422).json({ error: "'confidence' must be a number in [0,1]" });
      return;
    }
    const result = await deps.pipeline.evaluate({
      threadId: body.threadId,
      prompt: body.prompt,
      draft: body.draft,
      confidence,
      ...(typeof body.platform === "string" ? { platform: body.platform } : {}),
      ...(typeof body.contactId === "string" ? { contactId: body.contactId } : {}),
      ...(typeof body.model === "string" ? { model: body.model } : {})
    });
    res.status(201).json(envelope({ result }));
  });

  // --- Approval resolution -------------------------------------------------

  router.post("/audit/:id/resolve", limiter, async (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(400).json({ error: "invalid audit id" });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.approve !== "boolean") {
      res.status(422).json({ error: "'approve' must be a boolean" });
      return;
    }
    try {
      const audit = await deps.pipeline.resolve(id, {
        approve: body.approve,
        ...(typeof body.editedText === "string" ? { editedText: body.editedText } : {})
      });
      res.status(200).json(envelope({ audit }));
    } catch (err) {
      if (err instanceof AutoReplyResolveError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // --- Audit trail ---------------------------------------------------------

  router.get("/audit", limiter, (req: Request, res: Response) => {
    const q = req.query;
    const audits = deps.audit.list({
      ...(typeof q.threadId === "string" ? { threadId: q.threadId } : {}),
      ...(q.since !== undefined ? { since: Number(q.since) } : {}),
      ...(q.until !== undefined ? { until: Number(q.until) } : {}),
      ...(q.limit !== undefined ? { limit: Number(q.limit) } : {})
    });
    res.status(200).json(envelope({ audits }));
  });

  return router;
}
