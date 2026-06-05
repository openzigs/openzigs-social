/**
 * YouTube Data API v3 quota tracker (epic #58).
 *
 * YouTube meters every API call against a shared 10,000-unit daily budget that
 * resets at midnight UTC. Reads cost 1 unit; comment writes cost 50 units.
 *
 * The tracker persists daily unit totals in `youtube_quota_usage` (migration
 * `0011`). Upserts use ON CONFLICT to accumulate units atomically so a retry
 * or re-poll never double-counts.
 *
 * The `recordFn` injection pattern lets callers (connector adapters, routers)
 * supply a testable closure instead of coupling to the DB directly.
 */
import type { Database } from "better-sqlite3";

/** API cost in quota units for a YouTube Data API list/read call. */
export const READ_COST = 1;

/** API cost in quota units for a YouTube comment insert/reply call. */
export const WRITE_COST = 50;

/** YouTube Data API v3 daily free quota ceiling. */
export const YOUTUBE_DAILY_QUOTA = 10_000;

/** UTC date string 'YYYY-MM-DD' for a Date (or today). */
function utcDay(date?: Date): string {
  return (date ?? new Date()).toISOString().slice(0, 10);
}

/**
 * Record `units` of quota usage against `day_utc` (defaults to today UTC).
 *
 * Uses an upsert so the row is created on first use and accumulated thereafter.
 * The `day_utc` argument is exposed for tests; production callers omit it.
 */
export function recordQuotaUsage(db: Database, units: number, day_utc?: string): void {
  const day = day_utc ?? utcDay();
  db.prepare(
    `INSERT INTO youtube_quota_usage (day_utc, quota_units)
     VALUES (?, ?)
     ON CONFLICT(day_utc) DO UPDATE SET quota_units = quota_units + excluded.quota_units`
  ).run(day, units);
}

/**
 * Return the total quota units consumed on `day_utc` (defaults to today UTC).
 * Returns `0` when no row exists for the requested day.
 */
export function getQuotaUsage(db: Database, day_utc?: string): number {
  const day = day_utc ?? utcDay();
  const row = db
    .prepare(`SELECT quota_units FROM youtube_quota_usage WHERE day_utc = ?`)
    .get(day) as { quota_units: number } | undefined;
  return row?.quota_units ?? 0;
}

/**
 * Returns `true` when adding `cost` units to today's usage would exceed the
 * daily quota ceiling. Use this as a pre-dispatch guard: if exhausted, enqueue
 * the job for the next UTC day rather than failing.
 */
export function isQuotaExhausted(db: Database, cost: number, day_utc?: string): boolean {
  return getQuotaUsage(db, day_utc) + cost > YOUTUBE_DAILY_QUOTA;
}

/**
 * Interface for anything that can broadcast a plain-text notification (e.g.
 * {@link TelegramChannel}).  Kept narrow so the quota module stays decoupled
 * from the full Telegram implementation.
 */
export interface QuotaAlertNotifier {
  notify(text: string): Promise<void>;
}

/**
 * Send a one-time Telegram quota alert when usage reaches ≥ 80 % of the daily
 * ceiling.  The alert fires at most once per UTC day — a `alert_sent` flag on
 * the quota row is set after the first send and checked on every subsequent
 * call so the notification is never duplicated.
 *
 * Safe to call after every {@link recordQuotaUsage}: if the threshold hasn't
 * been crossed, or the alert was already sent today, this is a no-op.
 *
 * @param db        - Better-SQLite3 database instance.
 * @param notifier  - Telegram notifier (or `null`/`undefined` when not configured).
 * @param day_utc   - Override the UTC date string (tests only).
 */
export async function maybeSendQuotaAlert(
  db: Database,
  notifier: QuotaAlertNotifier | null | undefined,
  day_utc?: string
): Promise<void> {
  if (!notifier) return;
  const day = day_utc ?? utcDay();
  const used = getQuotaUsage(db, day);
  if (used / YOUTUBE_DAILY_QUOTA < 0.8) return;

  // Check if alert was already sent today.
  const row = db
    .prepare(`SELECT alert_sent FROM youtube_quota_usage WHERE day_utc = ?`)
    .get(day) as { alert_sent: number } | undefined;
  if (row?.alert_sent) return;

  const pct = Math.round((used / YOUTUBE_DAILY_QUOTA) * 100);
  await notifier.notify(
    `⚠️ YouTube quota alert: ${used}/${YOUTUBE_DAILY_QUOTA} units used today (${pct}%). Approaching daily limit.`
  );

  // Mark alert sent (the row must exist — recordQuotaUsage creates it first).
  db.prepare(`UPDATE youtube_quota_usage SET alert_sent = 1 WHERE day_utc = ?`).run(day);
}
