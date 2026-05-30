/**
 * X (Twitter) quota API router — Cohort C (#66, sub #69/#70).
 *
 * Route (under `/api/twitter`):
 *   - GET /quota — month-to-date X write-quota usage vs the active tier cap,
 *     for the model panel's usage widget.
 *
 * This endpoint reads only the non-secret credit ledger (`twitter_credit_usage`,
 * migration `0004`) — never any token material. It is rate-limited (60 req/min
 * per IP, mirroring the connections router) so a misbehaving client can't hammer
 * the database (the OWASP `js/missing-rate-limiting` posture used across the
 * read API).
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

import { TwitterCreditTracker } from "../../connectors/twitter/credit-tracker.js";
import type { Database } from "better-sqlite3";

export interface TwitterRouterDeps {
  db: Database;
  /** Active monthly write-quota cap for the configured tier. */
  cap: number;
  /** Configured tier label, surfaced for display. */
  tier: string;
}

/** Build the X quota router bound to the credit ledger. */
export function createTwitterRouter(deps: TwitterRouterDeps): Router {
  const router = Router();
  const tracker = new TwitterCreditTracker({ db: deps.db });

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/quota", limiter, (_req: Request, res: Response) => {
    const summary = tracker.summary(deps.cap);
    res.status(200).json({
      timestamp: new Date().toISOString(),
      tier: deps.tier,
      quota: summary
    });
  });

  return router;
}
