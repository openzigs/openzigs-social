/**
 * Light CRM API router (epic #90 — #91/#92/#93/#94).
 *
 * Routes (under `/api/contacts`):
 *   - GET  /                  — list identities with lead score + bucket
 *   - GET  /suggested-merges  — email-match merge queue (#94)
 *   - GET  /merges            — recorded merge history (#94)
 *   - GET  /:id               — identity detail + conversation timeline (#93)
 *   - POST /merge             — fold a source identity into a survivor (#94)
 *
 * Every handler applies a 60-req/min/IP rate limiter (OWASP
 * `js/missing-rate-limiting`). Responses are flat JSON envelopes. Untrusted
 * input is validated at the boundary; all SQL is parameterised in the repo.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import { CrmRepository, MergeError } from "../../crm/index.js";

export interface ContactsRouterDeps {
  repo: CrmRepository;
  /** Optional socket emit sink for live merge updates. */
  emit?: (event: string, payload: unknown) => void;
}

/** Parse a positive-integer route/query id, or `undefined` when invalid. */
function parseId(raw: unknown): number | undefined {
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Parse an optional positive-integer query param with a fallback. */
function parsePositive(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Validate + shape a merge request from an untrusted body. */
function parseMergeRequest(body: unknown): {
  survivorId: number;
  sourceId: number;
  mode: "manual" | "suggested";
} {
  if (typeof body !== "object" || body === null) {
    throw new TypeError("request body must be a JSON object");
  }
  const b = body as Record<string, unknown>;
  const survivorId = parseId(
    typeof b.survivorId === "number" ? String(b.survivorId) : b.survivorId
  );
  const sourceId = parseId(typeof b.sourceId === "number" ? String(b.sourceId) : b.sourceId);
  if (survivorId === undefined) throw new TypeError("'survivorId' must be a positive integer");
  if (sourceId === undefined) throw new TypeError("'sourceId' must be a positive integer");
  const mode = b.mode === "suggested" ? "suggested" : "manual";
  return { survivorId, sourceId, mode };
}

/** Build the CRM router bound to the live repository. */
export function createContactsRouter(deps: ContactsRouterDeps): Router {
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

  // --- List ----------------------------------------------------------------

  router.get("/", limiter, (req: Request, res: Response) => {
    const limit = parsePositive(req.query.limit);
    const offset = parsePositive(req.query.offset);
    const contacts = deps.repo.listContacts({ limit, offset });
    res.status(200).json(envelope({ contacts }));
  });

  // --- Suggested merges ----------------------------------------------------

  router.get("/suggested-merges", limiter, (_req: Request, res: Response) => {
    res.status(200).json(envelope({ suggestions: deps.repo.suggestedMerges() }));
  });

  // --- Merge history -------------------------------------------------------

  router.get("/merges", limiter, (req: Request, res: Response) => {
    const limit = parsePositive(req.query.limit);
    res.status(200).json(envelope({ merges: deps.repo.listMerges(limit) }));
  });

  // --- Merge ---------------------------------------------------------------

  router.post("/merge", limiter, (req: Request, res: Response) => {
    let parsed: { survivorId: number; sourceId: number; mode: "manual" | "suggested" };
    try {
      parsed = parseMergeRequest(req.body);
    } catch (err) {
      res.status(422).json({ error: (err as Error).message });
      return;
    }
    try {
      const contact = deps.repo.merge(parsed.survivorId, parsed.sourceId, parsed.mode);
      deps.emit?.("crm:merge", {
        survivorId: parsed.survivorId,
        sourceId: parsed.sourceId,
        mode: parsed.mode
      });
      res.status(200).json(envelope({ contact }));
    } catch (err) {
      if (err instanceof MergeError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // --- Detail --------------------------------------------------------------

  router.get("/:id", limiter, (req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (id === undefined) {
      res.status(422).json({ error: "invalid contact id" });
      return;
    }
    const contact = deps.repo.getContactDetail(id);
    if (!contact) {
      res.status(404).json({ error: "contact not found" });
      return;
    }
    res.status(200).json(envelope({ contact }));
  });

  return router;
}
