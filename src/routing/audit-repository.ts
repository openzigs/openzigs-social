/**
 * Auto-reply audit repository (epic #78, #82).
 *
 * Every auto-reply decision is recorded as one row in `auto_reply_audit`
 * (migration 0008). A row is created the moment the Hybrid posture (#81) reaches
 * a decision — capturing the prompt, draft, both scores, and the route — and is
 * finalised once the outcome resolves (auto-sent immediately, or sent/rejected
 * after an approval). Rows are queryable by thread and by time range to back the
 * per-thread decision-log panel, and a contact-scoped delete supports the #138
 * right-to-delete cascade.
 *
 * Every statement is a parameterized prepared statement (A03).
 */
import type { Database, Statement } from "better-sqlite3";

/** Routing decision recorded on an audit row. */
export type AuditDecision = "auto_send" | "queue";

/** Terminal outcome of an audited reply. */
export type AuditOutcome = "pending" | "sent" | "rejected";

/** A persisted audit row. */
export interface AutoReplyAudit {
  id: number;
  threadId: string;
  contactId?: string;
  platform: string;
  prompt: string;
  draftText: string;
  finalText?: string;
  confidence: number;
  voiceMatch: number;
  toneMatch: number;
  bannedHits: string[];
  decision: AuditDecision;
  model?: string;
  humanOverride: boolean;
  outcome: AuditOutcome;
  createdAt: number;
  updatedAt: number;
}

/** Fields accepted when recording a new audit row. */
export interface AuditRecordInput {
  threadId: string;
  contactId?: string;
  platform?: string;
  prompt: string;
  draftText: string;
  confidence: number;
  voiceMatch: number;
  toneMatch: number;
  bannedHits?: string[];
  decision: AuditDecision;
  model?: string;
  /** Outcome at record time. Defaults to `pending` (queued) when omitted. */
  outcome?: AuditOutcome;
  /** Final sent text, when already known (auto-send path). */
  finalText?: string;
}

/**
 * Retention bounds for {@link AutoReplyAuditRepository.prune}. Both bounds are
 * optional and independent: an undefined / non-finite bound is skipped, so a
 * caller can apply just an age window, just a row cap, or both.
 */
export interface AuditPruneInput {
  /** Delete rows with `created_at` strictly older than this epoch-ms cutoff. */
  olderThan?: number;
  /** Keep at most this many newest rows; delete everything older beyond it. */
  maxRows?: number;
}

/** Fields accepted when finalising an audit row's outcome. */
export interface AuditFinalizeInput {
  outcome: AuditOutcome;
  finalText?: string;
  humanOverride?: boolean;
}

/** Filter for {@link AutoReplyAuditRepository.list}. */
export interface AuditFilter {
  threadId?: string;
  /** Inclusive lower bound on `created_at` (epoch ms). */
  since?: number;
  /** Inclusive upper bound on `created_at` (epoch ms). */
  until?: number;
  limit?: number;
}

interface AuditRow {
  id: number;
  thread_id: string;
  contact_id: string | null;
  platform: string;
  prompt: string;
  draft_text: string;
  final_text: string | null;
  confidence: number;
  voice_match: number;
  tone_match: number;
  banned_hits_json: string;
  decision: AuditDecision;
  model: string | null;
  human_override: number;
  outcome: AuditOutcome;
  created_at: number;
  updated_at: number;
}

function parseBannedHits(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function toAudit(row: AuditRow): AutoReplyAudit {
  const audit: AutoReplyAudit = {
    id: row.id,
    threadId: row.thread_id,
    platform: row.platform,
    prompt: row.prompt,
    draftText: row.draft_text,
    confidence: row.confidence,
    voiceMatch: row.voice_match,
    toneMatch: row.tone_match,
    bannedHits: parseBannedHits(row.banned_hits_json),
    decision: row.decision,
    humanOverride: row.human_override === 1,
    outcome: row.outcome,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (row.contact_id !== null) audit.contactId = row.contact_id;
  if (row.final_text !== null) audit.finalText = row.final_text;
  if (row.model !== null) audit.model = row.model;
  return audit;
}

/** Thrown when an audit row does not exist. */
export class AuditNotFoundError extends Error {
  readonly id: number;
  constructor(id: number) {
    super(`auto-reply audit row ${id} not found`);
    this.name = "AuditNotFoundError";
    this.id = id;
  }
}

export interface AutoReplyAuditRepositoryOptions {
  /** Injectable clock (epoch ms) for deterministic timestamps in tests. */
  now?: () => number;
}

export class AutoReplyAuditRepository {
  private readonly db: Database;
  private readonly now: () => number;
  private readonly insertStmt: Statement;
  private readonly getStmt: Statement;
  private readonly finalizeStmt: Statement;
  private readonly deleteByContactStmt: Statement;
  private readonly pruneOlderStmt: Statement;
  private readonly pruneCapStmt: Statement;

  constructor(db: Database, opts: AutoReplyAuditRepositoryOptions = {}) {
    this.db = db;
    this.now = opts.now ?? (() => Date.now());
    this.insertStmt = db.prepare(
      `INSERT INTO auto_reply_audit
         (thread_id, contact_id, platform, prompt, draft_text, final_text,
          confidence, voice_match, tone_match, banned_hits_json, decision,
          model, human_override, outcome, created_at, updated_at)
       VALUES
         (@threadId, @contactId, @platform, @prompt, @draftText, @finalText,
          @confidence, @voiceMatch, @toneMatch, @bannedHitsJson, @decision,
          @model, @humanOverride, @outcome, @now, @now)`
    );
    this.getStmt = db.prepare(`SELECT * FROM auto_reply_audit WHERE id = ?`);
    this.finalizeStmt = db.prepare(
      `UPDATE auto_reply_audit
          SET outcome = @outcome,
              final_text = @finalText,
              human_override = @humanOverride,
              updated_at = @now
        WHERE id = @id`
    );
    this.deleteByContactStmt = db.prepare(`DELETE FROM auto_reply_audit WHERE contact_id = ?`);
    this.pruneOlderStmt = db.prepare(`DELETE FROM auto_reply_audit WHERE created_at < @cutoff`);
    // Keep the newest @cap rows (matching list()'s created_at DESC, id DESC
    // ordering); delete everything outside that window. Parameterized so a
    // forged cap can never widen the scan.
    this.pruneCapStmt = db.prepare(
      `DELETE FROM auto_reply_audit
        WHERE id NOT IN (
          SELECT id FROM auto_reply_audit
           ORDER BY created_at DESC, id DESC
           LIMIT @cap
        )`
    );
  }

  /** Record a new audit row and return it. */
  record(input: AuditRecordInput): AutoReplyAudit {
    const now = this.now();
    const info = this.insertStmt.run({
      threadId: input.threadId,
      contactId: input.contactId ?? null,
      platform: input.platform ?? "",
      prompt: input.prompt,
      draftText: input.draftText,
      finalText: input.finalText ?? null,
      confidence: input.confidence,
      voiceMatch: input.voiceMatch,
      toneMatch: input.toneMatch,
      bannedHitsJson: JSON.stringify(input.bannedHits ?? []),
      decision: input.decision,
      model: input.model ?? null,
      humanOverride: 0,
      outcome: input.outcome ?? "pending",
      now
    });
    return this.getOrThrow(Number(info.lastInsertRowid));
  }

  /** Read a single audit row, or `undefined` when it does not exist. */
  get(id: number): AutoReplyAudit | undefined {
    const row = this.getStmt.get(id) as AuditRow | undefined;
    return row ? toAudit(row) : undefined;
  }

  /** Finalise an audit row's outcome (sent/rejected) and return it. */
  finalize(id: number, input: AuditFinalizeInput): AutoReplyAudit {
    const existing = this.getOrThrow(id);
    this.finalizeStmt.run({
      id,
      outcome: input.outcome,
      finalText: input.finalText ?? existing.finalText ?? null,
      humanOverride: input.humanOverride ? 1 : existing.humanOverride ? 1 : 0,
      now: this.now()
    });
    return this.getOrThrow(id);
  }

  /** List audit rows, newest first, optionally filtered by thread and time. */
  list(filter: AuditFilter = {}): AutoReplyAudit[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.threadId !== undefined) {
      clauses.push("thread_id = @threadId");
      params.threadId = filter.threadId;
    }
    if (filter.since !== undefined) {
      clauses.push("created_at >= @since");
      params.since = filter.since;
    }
    if (filter.until !== undefined) {
      clauses.push("created_at <= @until");
      params.until = filter.until;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = normalizeLimit(filter.limit);
    params.limit = limit;
    const stmt = this.db.prepare(
      `SELECT * FROM auto_reply_audit ${where} ORDER BY created_at DESC, id DESC LIMIT @limit`
    );
    return (stmt.all(params) as AuditRow[]).map(toAudit);
  }

  /** Delete every audit row owned by a contact (#138 right-to-delete cascade). */
  deleteByContact(contactId: string): number {
    return this.deleteByContactStmt.run(contactId).changes;
  }

  /**
   * Apply the retention policy (#163): drop rows older than `olderThan` and/or
   * cap the table at the newest `maxRows`. Returns the total rows deleted. Both
   * bounds are clamped at this boundary — a non-finite or negative value is
   * skipped rather than producing an unbounded or `LIMIT -1` delete.
   */
  prune(input: AuditPruneInput): number {
    let deleted = 0;
    if (input.olderThan !== undefined && Number.isFinite(input.olderThan)) {
      deleted += this.pruneOlderStmt.run({ cutoff: input.olderThan }).changes;
    }
    if (input.maxRows !== undefined && Number.isFinite(input.maxRows) && input.maxRows >= 0) {
      deleted += this.pruneCapStmt.run({ cap: Math.floor(input.maxRows) }).changes;
    }
    return deleted;
  }

  private getOrThrow(id: number): AutoReplyAudit {
    const audit = this.get(id);
    if (!audit) throw new AuditNotFoundError(id);
    return audit;
  }
}

/**
 * Normalise a list limit at the repository boundary. SQLite treats `LIMIT -1`
 * as unbounded, so a negative or non-finite request must be clamped to a sane
 * default rather than leaking an unbounded scan.
 */
function normalizeLimit(limit: number | undefined): number {
  const DEFAULT = 100;
  const MAX = 500;
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT;
  const floored = Math.floor(limit);
  if (floored <= 0) return DEFAULT;
  return Math.min(floored, MAX);
}
