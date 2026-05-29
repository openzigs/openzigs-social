/**
 * Webhook event de-duplication store (#140).
 *
 * Platforms re-deliver webhooks on timeout/retry, so the receiver must be
 * idempotent. This store records each `(platform, event_id)` in the
 * `webhook_events` table (created by `0002-platform-service.sql`) and reports
 * whether the event is new. The UNIQUE constraint makes the check atomic even
 * under concurrent deliveries — `INSERT ... ON CONFLICT DO NOTHING` returns a
 * zero `changes` count for a duplicate.
 *
 * All SQL uses better-sqlite3 prepared statements (no injection).
 */
import type { Database, Statement } from "better-sqlite3";

export class WebhookEventStore {
  private readonly insertStmt: Statement;
  private readonly existsStmt: Statement;

  constructor(private readonly db: Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO webhook_events (platform, event_id)
       VALUES (@platform, @eventId)
       ON CONFLICT(platform, event_id) DO NOTHING`
    );
    this.existsStmt = db.prepare(
      `SELECT 1 FROM webhook_events WHERE platform = @platform AND event_id = @eventId LIMIT 1`
    );
  }

  /**
   * Atomically record an event. Returns `true` if it was new (caller should
   * process it) or `false` if it was already seen (caller should skip).
   */
  recordIfNew(platform: string, eventId: string): boolean {
    const result = this.insertStmt.run({ platform, eventId });
    return result.changes > 0;
  }

  /** Whether an event has already been recorded. */
  seen(platform: string, eventId: string): boolean {
    return this.existsStmt.get({ platform, eventId }) !== undefined;
  }
}
