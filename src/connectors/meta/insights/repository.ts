/**
 * Raw platform-insights repository (epic #53; shared analytics store #96).
 *
 * Persists individual metric readings polled from social platforms (Threads
 * media insights #137, Facebook Page/post insights #57). Backed by the
 * `platform_insights_raw` table from migration `0003-meta-insights.sql`.
 *
 * Writes are idempotent on `(platform, object_type, object_id, metric,
 * captured_for)` via an UPSERT, so a poller can run repeatedly without
 * duplicating rows — a re-poll of the same window updates the value in place.
 * All SQL uses better-sqlite3 prepared statements (no string-built SQL).
 */
import type { Database, Statement } from "better-sqlite3";

export interface InsightReadingInput {
  platform: string;
  /** e.g. `"account"`, `"post"`, `"media"`, `"page"`. */
  objectType: string;
  objectId: string;
  metric: string;
  value?: number | null;
  /** The window the metric describes (platform end_time or capture key). */
  capturedFor: string;
  metadata?: Record<string, unknown>;
}

export interface InsightReading {
  id: number;
  platform: string;
  objectType: string;
  objectId: string;
  metric: string;
  value?: number;
  capturedFor: string;
  capturedAt: string;
  metadata?: Record<string, unknown>;
}

interface InsightRow {
  id: number;
  platform: string;
  object_type: string;
  object_id: string;
  metric: string;
  value: number | null;
  captured_for: string;
  captured_at: string;
  metadata_json: string | null;
}

function parseMetadata(json: string | null): Record<string, unknown> | undefined {
  if (json === null) return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function toReading(row: InsightRow): InsightReading {
  return {
    id: row.id,
    platform: row.platform,
    objectType: row.object_type,
    objectId: row.object_id,
    metric: row.metric,
    ...(row.value !== null ? { value: row.value } : {}),
    capturedFor: row.captured_for,
    capturedAt: row.captured_at,
    metadata: parseMetadata(row.metadata_json)
  };
}

export class InsightsRepository {
  private readonly upsertStmt: Statement;
  private readonly getStmt: Statement;
  private readonly listByObjectStmt: Statement;

  constructor(db: Database) {
    this.upsertStmt = db.prepare(
      `INSERT INTO platform_insights_raw
         (platform, object_type, object_id, metric, value, captured_for, metadata_json)
       VALUES (@platform, @objectType, @objectId, @metric, @value, @capturedFor, @metadataJson)
       ON CONFLICT (platform, object_type, object_id, metric, captured_for)
       DO UPDATE SET value = excluded.value,
                     metadata_json = excluded.metadata_json,
                     captured_at = datetime('now')`
    );
    this.getStmt = db.prepare(
      `SELECT * FROM platform_insights_raw
       WHERE platform = @platform AND object_type = @objectType AND object_id = @objectId
         AND metric = @metric AND captured_for = @capturedFor`
    );
    this.listByObjectStmt = db.prepare(
      `SELECT * FROM platform_insights_raw
       WHERE platform = ? AND object_type = ? AND object_id = ?
       ORDER BY metric, captured_for`
    );
  }

  /** Insert or update a metric reading. Returns the stored row. */
  record(input: InsightReadingInput): InsightReading {
    const params = {
      platform: input.platform,
      objectType: input.objectType,
      objectId: input.objectId,
      metric: input.metric,
      value: input.value ?? null,
      capturedFor: input.capturedFor,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null
    };
    this.upsertStmt.run(params);
    return toReading(this.getStmt.get(params) as InsightRow);
  }

  /** Record many readings in a single call. */
  recordMany(inputs: InsightReadingInput[]): InsightReading[] {
    return inputs.map((input) => this.record(input));
  }

  listByObject(platform: string, objectType: string, objectId: string): InsightReading[] {
    const rows = this.listByObjectStmt.all(platform, objectType, objectId) as InsightRow[];
    return rows.map(toReading);
  }
}
