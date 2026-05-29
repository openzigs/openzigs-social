/**
 * Dead-letter queue repository (#142).
 *
 * Terminally-failed outbound ops (retry budget exhausted, or a non-retryable
 * error) land here so they are never silently dropped. Backed by the
 * `outbox_dlq` table from migration `0002-platform-service.sql`. All writes use
 * prepared statements (no injection).
 */
import type { Database, Statement } from "better-sqlite3";

/** A landed dead-letter row. */
export interface DlqEntry {
  id: number;
  platform: string;
  opKind: string;
  payloadJson: string;
  lastError: string;
  attempts: number;
  createdAt: string;
}

/** Fields accepted when landing a dead letter. */
export interface DlqInput {
  platform: string;
  /** Logical operation kind, e.g. `"publish"`, `"dm.send"`. */
  opKind: string;
  /** Original payload — serialized to JSON for storage. */
  payload: unknown;
  /** Human-readable last error message. */
  lastError: string;
  /** How many attempts were made before giving up. */
  attempts: number;
}

interface DlqRow {
  id: number;
  platform: string;
  op_kind: string;
  payload_json: string;
  last_error: string;
  attempts: number;
  created_at: string;
}

function toEntry(row: DlqRow): DlqEntry {
  return {
    id: row.id,
    platform: row.platform,
    opKind: row.op_kind,
    payloadJson: row.payload_json,
    lastError: row.last_error,
    attempts: row.attempts,
    createdAt: row.created_at
  };
}

export class DlqRepository {
  private readonly insert: Statement;
  private readonly getById: Statement;
  private readonly listByPlatform: Statement;
  private readonly listAll: Statement;

  constructor(db: Database) {
    this.insert = db.prepare(
      `INSERT INTO outbox_dlq (platform, op_kind, payload_json, last_error, attempts)
       VALUES (@platform, @opKind, @payloadJson, @lastError, @attempts)`
    );
    this.getById = db.prepare(`SELECT * FROM outbox_dlq WHERE id = ?`);
    this.listByPlatform = db.prepare(
      `SELECT * FROM outbox_dlq WHERE platform = ? ORDER BY id DESC LIMIT ? OFFSET ?`
    );
    this.listAll = db.prepare(`SELECT * FROM outbox_dlq ORDER BY id DESC LIMIT ? OFFSET ?`);
  }

  /** Land a dead letter; returns the stored row. */
  land(input: DlqInput): DlqEntry {
    const info = this.insert.run({
      platform: input.platform,
      opKind: input.opKind,
      payloadJson: JSON.stringify(input.payload ?? null),
      lastError: input.lastError,
      attempts: input.attempts
    });
    return toEntry(this.getById.get(Number(info.lastInsertRowid)) as DlqRow);
  }

  get(id: number): DlqEntry | undefined {
    const row = this.getById.get(id) as DlqRow | undefined;
    return row ? toEntry(row) : undefined;
  }

  list(opts: { platform?: string; limit?: number; offset?: number } = {}): DlqEntry[] {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const rows =
      opts.platform === undefined
        ? (this.listAll.all(limit, offset) as DlqRow[])
        : (this.listByPlatform.all(opts.platform, limit, offset) as DlqRow[]);
    return rows.map(toEntry);
  }
}
