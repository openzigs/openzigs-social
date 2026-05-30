/**
 * Inbox aggregation + search read model (#74/#76/#77).
 *
 * Cross-platform READ API over the data SocialBrain (#143) already persists.
 * This repository never writes contacts/threads/messages — inbound ingestion is
 * the connectors' job. It only:
 *
 *   - aggregates threads across platforms with unread counts + rule-derived
 *     priority for the unified thread list (#76),
 *   - reads a single thread split into DM vs comment sections (#76),
 *   - applies platform / account filters + FTS5 full-text search (#77),
 *   - tracks the per-thread read cursor (`markRead`).
 *
 * Every statement is a parameterized prepared statement; the full-text search
 * MATCH expression is bound as a parameter (never string-interpolated SQL), and
 * user terms are escaped so a query can only ever be a set of phrase/prefix
 * tokens — it can't inject FTS5 operators or SQL.
 */
import type { Database, Statement } from "better-sqlite3";

import type { SocialContact, SocialMessage } from "../platform/social-brain/repository.js";
import { limitsFor, type PlatformInboxLimits } from "./platform-limits.js";

/** A thread summary row for the unified inbox list. */
export interface InboxThreadSummary {
  id: number;
  platform: string;
  platformThreadId: string;
  subject?: string;
  contact?: {
    id: number;
    handle?: string;
    displayName?: string;
    platformContactId: string;
    avatarUrl?: string;
  };
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  priority: string;
  flagged: boolean;
  dmSupported: boolean;
}

/** A message tagged with its inbox section. */
export interface InboxMessage extends SocialMessage {
  /** `"dm"` or `"comment"`, read from message metadata. */
  kind: "dm" | "comment";
}

/** Full thread detail: contact, sectioned messages, capabilities. */
export interface InboxThreadDetail {
  id: number;
  platform: string;
  platformThreadId: string;
  subject?: string;
  contact?: SocialContact;
  priority: string;
  flagged: boolean;
  lastReadAt?: string;
  dmSupported: boolean;
  limits: PlatformInboxLimits;
  /** DM-section messages (empty array when the platform is comments-only). */
  dms: InboxMessage[];
  /** Comment-section messages. */
  comments: InboxMessage[];
}

/** Filters / pagination for {@link InboxRepository.listThreads}. */
export interface ListThreadsOptions {
  platform?: string;
  contactId?: number;
  /** Free-text search across message bodies (FTS5). */
  search?: string;
  limit?: number;
  offset?: number;
}

interface ThreadSummaryRow {
  id: number;
  platform: string;
  platform_thread_id: string;
  subject: string | null;
  contact_id: number | null;
  c_handle: string | null;
  c_display_name: string | null;
  c_platform_contact_id: string | null;
  c_avatar_url: string | null;
  last_message_at: string | null;
  priority: string | null;
  flagged: number | null;
  unread_count: number;
  last_body: string | null;
}

interface ThreadDetailRow {
  id: number;
  platform: string;
  platform_thread_id: string;
  subject: string | null;
  contact_id: number | null;
  priority: string | null;
  flagged: number | null;
  last_read_at: string | null;
}

interface ContactRow {
  id: number;
  platform: string;
  platform_contact_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: number;
  platform: string;
  platform_message_id: string;
  thread_id: number | null;
  contact_id: number | null;
  direction: string;
  body: string;
  metadata_json: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Priority ordering expression shared by list queries (urgent first). */
const PRIORITY_RANK_SQL = `CASE COALESCE(s.priority, 'normal')
  WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'normal' THEN 1 WHEN 'low' THEN 0 ELSE 1 END`;

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

function messageKind(meta: Record<string, unknown> | undefined): "dm" | "comment" {
  return meta?.["kind"] === "comment" ? "comment" : "dm";
}

function toContact(row: ContactRow): SocialContact {
  return {
    id: row.id,
    platform: row.platform,
    platformContactId: row.platform_contact_id,
    handle: row.handle ?? undefined,
    displayName: row.display_name ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toInboxMessage(row: MessageRow): InboxMessage {
  const metadata = parseMetadata(row.metadata_json);
  return {
    id: row.id,
    platform: row.platform,
    platformMessageId: row.platform_message_id,
    threadId: row.thread_id ?? undefined,
    contactId: row.contact_id ?? undefined,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    body: row.body,
    metadata,
    sentAt: row.sent_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kind: messageKind(metadata)
  };
}

/**
 * Build a safe FTS5 MATCH expression from raw user input.
 *
 * Each whitespace-separated term becomes a quoted prefix token (`"term"*`).
 * Internal double-quotes are doubled so the term stays a literal phrase — the
 * user can never inject FTS5 boolean/column operators. Returns `undefined` when
 * the input has no usable terms (callers then skip search entirely).
 */
export function buildMatchExpression(search: string): string | undefined {
  const terms = search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"*`);
  return terms.length > 0 ? terms.join(" ") : undefined;
}

export class InboxRepository {
  private readonly db: Database;
  private readonly stmts: {
    listThreads: Statement;
    getThread: Statement;
    getContact: Statement;
    listMessages: Statement;
    markRead: Statement;
  };

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      listThreads: db.prepare(
        `SELECT
           t.id, t.platform, t.platform_thread_id, t.subject, t.contact_id,
           c.handle AS c_handle, c.display_name AS c_display_name,
           c.platform_contact_id AS c_platform_contact_id, c.avatar_url AS c_avatar_url,
           t.last_message_at, s.priority, s.flagged,
           (SELECT COUNT(*) FROM social_messages m
              WHERE m.thread_id = t.id AND m.direction = 'inbound'
                AND (s.last_read_at IS NULL
                     OR COALESCE(m.sent_at, m.created_at) > s.last_read_at)) AS unread_count,
           (SELECT m2.body FROM social_messages m2
              WHERE m2.thread_id = t.id
              ORDER BY COALESCE(m2.sent_at, m2.created_at) DESC, m2.id DESC
              LIMIT 1) AS last_body
         FROM social_threads t
         LEFT JOIN social_contacts c ON c.id = t.contact_id
         LEFT JOIN inbox_thread_state s ON s.thread_id = t.id
         WHERE (@platform IS NULL OR t.platform = @platform)
           AND (@contactId IS NULL OR t.contact_id = @contactId)
           AND (@match IS NULL OR t.id IN (
                 SELECT m3.thread_id FROM social_messages m3
                 JOIN social_messages_fts f ON f.rowid = m3.id
                 WHERE f.body MATCH @match))
         ORDER BY ${PRIORITY_RANK_SQL} DESC,
                  COALESCE(t.last_message_at, t.updated_at) DESC, t.id DESC
         LIMIT @limit OFFSET @offset`
      ),
      getThread: db.prepare(
        `SELECT t.id, t.platform, t.platform_thread_id, t.subject, t.contact_id,
                s.priority, s.flagged, s.last_read_at
         FROM social_threads t
         LEFT JOIN inbox_thread_state s ON s.thread_id = t.id
         WHERE t.id = ?`
      ),
      getContact: db.prepare(`SELECT * FROM social_contacts WHERE id = ?`),
      listMessages: db.prepare(
        `SELECT * FROM social_messages WHERE thread_id = ?
         ORDER BY COALESCE(sent_at, created_at) ASC, id ASC`
      ),
      markRead: db.prepare(
        `INSERT INTO inbox_thread_state (thread_id, last_read_at, updated_at)
         VALUES (@threadId, @at, datetime('now'))
         ON CONFLICT (thread_id) DO UPDATE SET
           last_read_at = @at, updated_at = datetime('now')`
      )
    };
  }

  /** List threads across platforms with filters, search, and priority sort. */
  listThreads(options: ListThreadsOptions = {}): InboxThreadSummary[] {
    const search = options.search?.trim();
    const match = search && search.length > 0 ? buildMatchExpression(search) : undefined;
    const rows = this.stmts.listThreads.all({
      platform: options.platform ?? null,
      contactId: options.contactId ?? null,
      match: match ?? null,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0
    }) as ThreadSummaryRow[];

    return rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      platformThreadId: row.platform_thread_id,
      subject: row.subject ?? undefined,
      contact:
        row.contact_id !== null
          ? {
              id: row.contact_id,
              handle: row.c_handle ?? undefined,
              displayName: row.c_display_name ?? undefined,
              platformContactId: row.c_platform_contact_id ?? "",
              avatarUrl: row.c_avatar_url ?? undefined
            }
          : undefined,
      lastMessageAt: row.last_message_at ?? undefined,
      lastMessagePreview: row.last_body ?? undefined,
      unreadCount: row.unread_count,
      priority: row.priority ?? "normal",
      flagged: (row.flagged ?? 0) !== 0,
      dmSupported: limitsFor(row.platform).dmSupported
    }));
  }

  /** Read one thread with its messages split into DM and comment sections. */
  getThread(id: number): InboxThreadDetail | undefined {
    const row = this.stmts.getThread.get(id) as ThreadDetailRow | undefined;
    if (!row) return undefined;

    const limits = limitsFor(row.platform);
    const messages = (this.stmts.listMessages.all(id) as MessageRow[]).map(toInboxMessage);
    const contactRow =
      row.contact_id !== null
        ? (this.stmts.getContact.get(row.contact_id) as ContactRow | undefined)
        : undefined;

    return {
      id: row.id,
      platform: row.platform,
      platformThreadId: row.platform_thread_id,
      subject: row.subject ?? undefined,
      contact: contactRow ? toContact(contactRow) : undefined,
      priority: row.priority ?? "normal",
      flagged: (row.flagged ?? 0) !== 0,
      lastReadAt: row.last_read_at ?? undefined,
      dmSupported: limits.dmSupported,
      limits,
      // When the platform is comments-only, never surface a DM section even if
      // stray DM-kind rows exist — the UI relies on this to hide the section.
      dms: limits.dmSupported ? messages.filter((m) => m.kind === "dm") : [],
      comments: messages.filter((m) => m.kind === "comment")
    };
  }

  /** Mark a thread read up to `at` (default: now). Idempotent upsert. */
  markRead(threadId: number, at: string = new Date().toISOString()): void {
    this.stmts.markRead.run({ threadId, at });
  }
}
