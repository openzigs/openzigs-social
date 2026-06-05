/**
 * YouTube quota API router (epic #58).
 *
 * Route (under `/api/youtube`):
 *   - GET /quota — today's YouTube Data API v3 quota usage vs the 10,000-unit
 *     daily limit, for the model panel and settings widget.
 *
 * This endpoint reads only the non-secret `youtube_quota_usage` ledger
 * (migration `0011`) — never token material. Rate-limited at 60 req/min/IP
 * (OWASP `js/missing-rate-limiting`).
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import type { Database } from "better-sqlite3";

import { getQuotaUsage, YOUTUBE_DAILY_QUOTA } from "../../connectors/youtube/quota.js";

export interface YouTubeRouterDeps {
  db: Database;
}

/** Build the YouTube quota router. */
export function createYouTubeRouter(deps: YouTubeRouterDeps): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/quota", limiter, (_req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10);
    const used = getQuotaUsage(deps.db, today);
    const pct = Math.min(100, Math.round((used / YOUTUBE_DAILY_QUOTA) * 100));
    res.status(200).json({
      day_utc: today,
      used,
      limit: YOUTUBE_DAILY_QUOTA,
      pct
    });
  });

  return router;
}
