/**
 * Outbox SQLite repository + state machine (#85).
 *
 * The outbox is the queue the composer writes into and the node-cron poller
 * (#86) drains. Every row walks a strict five-state machine, enforced here so
 * an illegal transition is rejected at the repository boundary (mirroring the
 * rigor of the inbox rule repo):
 *
 *   draft → scheduled → publishing → published
 *                            └──────→ failed → scheduled (manual requeue)
 *   scheduled → draft (unschedule)
 *
 * `published` is terminal. Reschedule (#88 drag-to-reschedule) updates only
 * `publish_at` and never the platform. Every statement is a parameterized
 * prepared statement (A03). The poller's claim is an atomic conditional UPDATE
 * (`scheduled → publishing`) so two overlapping ticks can never double-publish.
 *
 * Persistence is the `outbox` table from migration `0007-outbox.sql`.
 */
import type { Database, Statement } from "better-sqlite3";

/** The five outbox states. */
export type OutboxStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

/** One media attachment stored on an outbox row. */
export interface OutboxMedia {
  url: string;
  type: string;
  altText?: string;
  bytes?: number;
}

/** A persisted outbox post. */
export interface OutboxPost {
  id: number;
  platform: string;
  accountId?: string;
  body: string;
  media: OutboxMedia[];
  status: OutboxStatus;
  /** Scheduled publish time (epoch ms); undefined for plain drafts. */
  publishAt?: number;
  /** Platform-native id once published. */
  externalId?: string;
  attempts: number;
  lastError?: string;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Fields accepted when creating an outbox post. */
export interface OutboxCreateInput {
  platform: string;
  accountId?: string;
  body?: string;
  media?: OutboxMedia[];
  /** When set, the post is created `scheduled` for this epoch-ms time. */
  publishAt?: number;
}

/** Fields accepted when editing a draft/scheduled/failed post. */
export interface OutboxUpdateInput {
  body?: string;
  media?: OutboxMedia[];
  accountId?: string;
}

/** Filter for {@link OutboxRepository.list}. */
export interface OutboxFilter {
  status?: OutboxStatus | OutboxStatus[];
  platform?: string;
  /** Inclusive lower bound on `publish_at` (epoch ms). */
  from?: number;
  /** Inclusive upper bound on `publish_at` (epoch ms). */
  to?: number;
  limit?: number;
  offset?: number;
}

/** Thrown when a requested state transition is not permitted. */
export class IllegalTransitionError extends Error {
  readonly from: OutboxStatus;
  readonly to: OutboxStatus;
  constructor(from: OutboxStatus, to: OutboxStatus) {
    super(`illegal outbox transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Thrown when an outbox row does not exist. */
export class OutboxNotFoundError extends Error {
  readonly id: number;
  constructor(id: number) {
    super(`outbox post ${id} not found`);
    this.name = "OutboxNotFoundError";
    this.id = id;
  }
}

/** Legal state-machine edges. The source of truth for {@link canTransition}. */
export const OUTBOX_TRANSITIONS: Record<OutboxStatus, OutboxStatus[]> = {
  draft: ["scheduled"],
  scheduled: ["draft", "publishing"],
  publishing: ["published", "failed"],
  published: [],
  failed: ["scheduled"]
};

/** Whether `from → to` is a permitted transition. */
export function canTransition(from: OutboxStatus, to: OutboxStatus): boolean {
  return OUTBOX_TRANSITIONS[from].includes(to);
}

interface OutboxRow {
  id: number;
  platform: string;
  account_id: string | null;
  body: string;
  media_json: string | null;
  status: OutboxStatus;
  publish_at: number | null;
  external_id: string | null;
  attempts: number;
  last_error: string | null;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

function parseMedia(json: string | null): OutboxMedia[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as OutboxMedia[]) : [];
  } catch {
    return [];
  }
}

function toPost(row: OutboxRow): OutboxPost {
  const post: OutboxPost = {
    id: row.id,
    platform: row.platform,
    body: row.body,
    media: parseMedia(row.media_json),
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.account_id !== null) post.accountId = row.account_id;
  if (row.publish_at !== null) post.publishAt = row.publish_at;
  if (row.external_id !== null) post.externalId = row.external_id;
  if (row.last_error !== null) post.lastError = row.last_error;
  if (row.published_at !== null) post.publishedAt = row.published_at;
  return post;
}

export interface OutboxRepositoryOptions {
  /** Injectable clock (epoch ms) for deterministic timestamps in tests. */
  now?: () => number;
}

export class OutboxRepository {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly insertStmt: Statement;
  private readonly getStmt: Statement;
  private readonly deleteStmt: Statement;
  private readonly claimStmt: Statement;

  constructor(db: Database, opts: OutboxRepositoryOptions = {}) {
    this.db = db;
    this.now = opts.now ?? (() => Date.now());
    this.insertStmt = db.prepare(
      `INSERT INTO outbox
         (platform, account_id, body, media_json, status, publish_at, attempts, created_at, updated_at)
       VALUES
         (@platform, @accountId, @body, @mediaJson, @status, @publishAt, 0, @now, @now)`
    );
    this.getStmt = db.prepare(`SELECT * FROM outbox WHERE id = ?`);
    this.deleteStmt = db.prepare(`DELETE FROM outbox WHERE id = ?`);
    // Atomic claim: flip due `scheduled` rows to `publishing` in a single
    // statement and return them. Because better-sqlite3 runs synchronously and
    // the UPDATE is guarded by `status='scheduled'`, an overlapping tick can
    // never re-claim a row already moved to `publishing`.
    this.claimStmt = db.prepare(
      `UPDATE outbox
          SET status = 'publishing',
              attempts = attempts + 1,
              updated_at = @now
        WHERE id IN (
          SELECT id FROM outbox
           WHERE status = 'scheduled'
             AND publish_at IS NOT NULL
             AND publish_at <= @now
           ORDER BY publish_at ASC
           LIMIT @limit
        )
        RETURNING *`
    );
  }

  /** Create a draft (no `publishAt`) or a scheduled post (`publishAt` set). */
  create(input: OutboxCreateInput): OutboxPost {
    const now = this.now();
    const status: OutboxStatus = input.publishAt !== undefined ? "scheduled" : "draft";
    const info = this.insertStmt.run({
      platform: input.platform,
      accountId: input.accountId ?? null,
      body: input.body ?? "",
      mediaJson: input.media && input.media.length > 0 ? JSON.stringify(input.media) : null,
      status,
      publishAt: input.publishAt ?? null,
      now
    });
    return this.getOrThrow(Number(info.lastInsertRowid));
  }

  /** Read a single post, or `undefined` when it does not exist. */
  get(id: number): OutboxPost | undefined {
    const row = this.getStmt.get(id) as OutboxRow | undefined;
    return row ? toPost(row) : undefined;
  }

  private getOrThrow(id: number): OutboxPost {
    const post = this.get(id);
    if (!post) throw new OutboxNotFoundError(id);
    return post;
  }

  /** List posts with optional status/platform/date-range filters. */
  list(filter: OutboxFilter = {}): OutboxPost[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.status !== undefined) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.push(`status IN (${statuses.map((_s, i) => `@status${i}`).join(", ")})`);
      statuses.forEach((s, i) => {
        params[`status${i}`] = s;
      });
    }
    if (filter.platform !== undefined) {
      where.push("platform = @platform");
      params.platform = filter.platform;
    }
    if (filter.from !== undefined) {
      where.push("publish_at >= @from");
      params.from = filter.from;
    }
    if (filter.to !== undefined) {
      where.push("publish_at <= @to");
      params.to = filter.to;
    }
    params.limit = Math.min(filter.limit ?? 200, 500);
    params.offset = Math.max(filter.offset ?? 0, 0);
    const sql =
      `SELECT * FROM outbox` +
      (where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "") +
      ` ORDER BY COALESCE(publish_at, created_at) ASC, id ASC LIMIT @limit OFFSET @offset`;
    const rows = this.db.prepare(sql).all(params) as OutboxRow[];
    return rows.map(toPost);
  }

  /** Edit a draft/scheduled/failed post's content (never its platform/status). */
  update(id: number, patch: OutboxUpdateInput): OutboxPost {
    const post = this.getOrThrow(id);
    if (post.status === "publishing" || post.status === "published") {
      throw new IllegalTransitionError(post.status, post.status);
    }
    const body = patch.body ?? post.body;
    const media = patch.media ?? post.media;
    const accountId = patch.accountId ?? post.accountId ?? null;
    this.db
      .prepare(
        `UPDATE outbox
            SET body = @body, media_json = @mediaJson, account_id = @accountId, updated_at = @now
          WHERE id = @id`
      )
      .run({
        id,
        body,
        mediaJson: media.length > 0 ? JSON.stringify(media) : null,
        accountId,
        now: this.now()
      });
    return this.getOrThrow(id);
  }

  /** Schedule a draft (`draft → scheduled`) for the given epoch-ms time. */
  schedule(id: number, publishAt: number): OutboxPost {
    return this.transition(id, "scheduled", { publishAt });
  }

  /** Unschedule a scheduled post back to a draft (`scheduled → draft`). */
  unschedule(id: number): OutboxPost {
    return this.transition(id, "draft", { publishAt: null });
  }

  /**
   * Drag-to-reschedule (#88): update only `publish_at`, keeping the platform
   * AND status unchanged. Permitted for `scheduled` or `failed` rows.
   */
  reschedule(id: number, publishAt: number): OutboxPost {
    const post = this.getOrThrow(id);
    if (post.status !== "scheduled" && post.status !== "failed") {
      throw new IllegalTransitionError(post.status, post.status);
    }
    // A failed row dragged onto the calendar is implicitly requeued to
    // `scheduled`; a scheduled row simply moves slot. Platform is never touched.
    this.db
      .prepare(
        `UPDATE outbox SET publish_at = @publishAt, status = 'scheduled', last_error = NULL, updated_at = @now WHERE id = @id`
      )
      .run({ id, publishAt, now: this.now() });
    return this.getOrThrow(id);
  }

  /**
   * Atomically claim up to `limit` due scheduled rows, flipping them to
   * `publishing` and returning them. Safe under overlapping ticks.
   */
  claimDue(now: number = this.now(), limit = 25): OutboxPost[] {
    const rows = this.claimStmt.all({ now, limit }) as OutboxRow[];
    return rows.map(toPost);
  }

  /** Mark a claimed post published (`publishing → published`). */
  markPublished(id: number, externalId?: string): OutboxPost {
    const post = this.getOrThrow(id);
    if (!canTransition(post.status, "published")) {
      throw new IllegalTransitionError(post.status, "published");
    }
    const now = this.now();
    this.db
      .prepare(
        `UPDATE outbox
            SET status = 'published', external_id = @externalId, published_at = @now,
                last_error = NULL, updated_at = @now
          WHERE id = @id`
      )
      .run({ id, externalId: externalId ?? null, now });
    return this.getOrThrow(id);
  }

  /** Mark a claimed post failed (`publishing → failed`) with a reason. */
  markFailed(id: number, error: string, attempts?: number): OutboxPost {
    const post = this.getOrThrow(id);
    if (!canTransition(post.status, "failed")) {
      throw new IllegalTransitionError(post.status, "failed");
    }
    const now = this.now();
    this.db
      .prepare(
        `UPDATE outbox
            SET status = 'failed', last_error = @error,
                attempts = COALESCE(@attempts, attempts), updated_at = @now
          WHERE id = @id`
      )
      .run({ id, error, attempts: attempts ?? null, now });
    return this.getOrThrow(id);
  }

  /** Manual requeue of a failed post (`failed → scheduled`). */
  retry(id: number, publishAt: number = this.now()): OutboxPost {
    return this.transition(id, "scheduled", { publishAt, clearError: true });
  }

  /** Delete a post. Returns true when a row was removed. */
  delete(id: number): boolean {
    return this.deleteStmt.run(id).changes > 0;
  }

  /**
   * Enforce a state-machine transition. Rejects illegal edges. Optional fields
   * (`publishAt`, error clearing) are applied atomically with the status flip.
   */
  transition(
    id: number,
    to: OutboxStatus,
    opts: { publishAt?: number | null; clearError?: boolean } = {}
  ): OutboxPost {
    const post = this.getOrThrow(id);
    if (!canTransition(post.status, to)) {
      throw new IllegalTransitionError(post.status, to);
    }
    const sets = ["status = @to", "updated_at = @now"];
    const params: Record<string, unknown> = { id, to, now: this.now() };
    if (opts.publishAt !== undefined) {
      sets.push("publish_at = @publishAt");
      params.publishAt = opts.publishAt;
    }
    if (opts.clearError) {
      sets.push("last_error = NULL");
    }
    this.db.prepare(`UPDATE outbox SET ${sets.join(", ")} WHERE id = @id`).run(params);
    return this.getOrThrow(id);
  }
}
