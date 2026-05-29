/**
 * SocialBrain SQLite repository (#143).
 *
 * Cross-platform persistence for inbound social data shared by every connector
 * (Cohort A/B/C), the unified inbox (#71), the auto-reply pipeline (#78), and
 * the DM dispatcher (#144). Three tables created by migration
 * `0002-platform-service.sql`:
 *
 *   - `social_contacts` — one row per platform-native author/recipient.
 *   - `social_threads`  — one row per conversation/thread.
 *   - `social_messages` — one row per message, idempotent on
 *     `(platform, platform_message_id)`.
 *
 * All writes go through better-sqlite3 prepared statements (no string-built
 * SQL → no injection). Upserts are atomic and idempotent so the same webhook
 * delivered twice never creates duplicates. The repository takes a `Database`
 * by injection so tests can use `:memory:` and the server uses `getDb()`.
 */
import type { Database, Statement } from "better-sqlite3";

/** A platform-native contact (DM author / recipient). */
export interface SocialContact {
  id: number;
  platform: string;
  platformContactId: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when upserting a contact. */
export interface UpsertContactInput {
  platform: string;
  platformContactId: string;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

/** A conversation thread on a platform. */
export interface SocialThread {
  id: number;
  platform: string;
  platformThreadId: string;
  contactId?: number;
  subject?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when upserting a thread. */
export interface UpsertThreadInput {
  platform: string;
  platformThreadId: string;
  contactId?: number;
  subject?: string;
  lastMessageAt?: string;
}

/** Direction of a stored message relative to the local user. */
export type MessageDirection = "inbound" | "outbound";

/** A single stored message. */
export interface SocialMessage {
  id: number;
  platform: string;
  platformMessageId: string;
  threadId?: number;
  contactId?: number;
  direction: MessageDirection;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted when upserting a message. */
export interface UpsertMessageInput {
  platform: string;
  platformMessageId: string;
  threadId?: number;
  contactId?: number;
  direction?: MessageDirection;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt?: string;
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

interface ThreadRow {
  id: number;
  platform: string;
  platform_thread_id: string;
  contact_id: number | null;
  subject: string | null;
  last_message_at: string | null;
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

function toThread(row: ThreadRow): SocialThread {
  return {
    id: row.id,
    platform: row.platform,
    platformThreadId: row.platform_thread_id,
    contactId: row.contact_id ?? undefined,
    subject: row.subject ?? undefined,
    lastMessageAt: row.last_message_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMessage(row: MessageRow): SocialMessage {
  return {
    id: row.id,
    platform: row.platform,
    platformMessageId: row.platform_message_id,
    threadId: row.thread_id ?? undefined,
    contactId: row.contact_id ?? undefined,
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    body: row.body,
    metadata: parseMetadata(row.metadata_json),
    sentAt: row.sent_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function serializeMetadata(meta?: Record<string, unknown>): string | null {
  return meta === undefined ? null : JSON.stringify(meta);
}

/** Typed CRUD/upsert/query over the SocialBrain tables. */
export class SocialBrainRepository {
  private readonly db: Database;
  private readonly stmts: {
    upsertContact: Statement;
    getContact: Statement;
    getContactByPlatformId: Statement;
    upsertThread: Statement;
    getThread: Statement;
    getThreadByPlatformId: Statement;
    upsertMessage: Statement;
    getMessage: Statement;
    getMessageByPlatformId: Statement;
    listMessagesByThread: Statement;
  };

  constructor(db: Database) {
    this.db = db;
    this.stmts = {
      upsertContact: db.prepare(
        `INSERT INTO social_contacts
           (platform, platform_contact_id, handle, display_name, avatar_url, metadata_json)
         VALUES (@platform, @platformContactId, @handle, @displayName, @avatarUrl, @metadata)
         ON CONFLICT (platform, platform_contact_id) DO UPDATE SET
           handle        = COALESCE(excluded.handle, social_contacts.handle),
           display_name  = COALESCE(excluded.display_name, social_contacts.display_name),
           avatar_url    = COALESCE(excluded.avatar_url, social_contacts.avatar_url),
           metadata_json = COALESCE(excluded.metadata_json, social_contacts.metadata_json),
           updated_at    = datetime('now')`
      ),
      getContact: db.prepare(`SELECT * FROM social_contacts WHERE id = ?`),
      getContactByPlatformId: db.prepare(
        `SELECT * FROM social_contacts WHERE platform = ? AND platform_contact_id = ?`
      ),
      upsertThread: db.prepare(
        `INSERT INTO social_threads
           (platform, platform_thread_id, contact_id, subject, last_message_at)
         VALUES (@platform, @platformThreadId, @contactId, @subject, @lastMessageAt)
         ON CONFLICT (platform, platform_thread_id) DO UPDATE SET
           contact_id      = COALESCE(excluded.contact_id, social_threads.contact_id),
           subject         = COALESCE(excluded.subject, social_threads.subject),
           last_message_at = COALESCE(excluded.last_message_at, social_threads.last_message_at),
           updated_at      = datetime('now')`
      ),
      getThread: db.prepare(`SELECT * FROM social_threads WHERE id = ?`),
      getThreadByPlatformId: db.prepare(
        `SELECT * FROM social_threads WHERE platform = ? AND platform_thread_id = ?`
      ),
      upsertMessage: db.prepare(
        `INSERT INTO social_messages
           (platform, platform_message_id, thread_id, contact_id, direction, body, metadata_json, sent_at)
         VALUES (@platform, @platformMessageId, @threadId, @contactId, @direction, @body, @metadata, @sentAt)
         ON CONFLICT (platform, platform_message_id) DO UPDATE SET
           thread_id     = COALESCE(excluded.thread_id, social_messages.thread_id),
           contact_id    = COALESCE(excluded.contact_id, social_messages.contact_id),
           body          = excluded.body,
           metadata_json = COALESCE(excluded.metadata_json, social_messages.metadata_json),
           sent_at       = COALESCE(excluded.sent_at, social_messages.sent_at),
           updated_at    = datetime('now')`
      ),
      getMessage: db.prepare(`SELECT * FROM social_messages WHERE id = ?`),
      getMessageByPlatformId: db.prepare(
        `SELECT * FROM social_messages WHERE platform = ? AND platform_message_id = ?`
      ),
      listMessagesByThread: db.prepare(
        `SELECT * FROM social_messages WHERE thread_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`
      )
    };
  }

  /** Upsert a contact, returning the full row. Idempotent on platform id. */
  upsertContact(input: UpsertContactInput): SocialContact {
    this.stmts.upsertContact.run({
      platform: input.platform,
      platformContactId: input.platformContactId,
      handle: input.handle ?? null,
      displayName: input.displayName ?? null,
      avatarUrl: input.avatarUrl ?? null,
      metadata: serializeMetadata(input.metadata)
    });
    const row = this.stmts.getContactByPlatformId.get(
      input.platform,
      input.platformContactId
    ) as ContactRow;
    return toContact(row);
  }

  getContact(id: number): SocialContact | undefined {
    const row = this.stmts.getContact.get(id) as ContactRow | undefined;
    return row ? toContact(row) : undefined;
  }

  getContactByPlatformId(platform: string, platformContactId: string): SocialContact | undefined {
    const row = this.stmts.getContactByPlatformId.get(platform, platformContactId) as
      | ContactRow
      | undefined;
    return row ? toContact(row) : undefined;
  }

  /** Upsert a thread, returning the full row. Idempotent on platform id. */
  upsertThread(input: UpsertThreadInput): SocialThread {
    this.stmts.upsertThread.run({
      platform: input.platform,
      platformThreadId: input.platformThreadId,
      contactId: input.contactId ?? null,
      subject: input.subject ?? null,
      lastMessageAt: input.lastMessageAt ?? null
    });
    const row = this.stmts.getThreadByPlatformId.get(
      input.platform,
      input.platformThreadId
    ) as ThreadRow;
    return toThread(row);
  }

  getThread(id: number): SocialThread | undefined {
    const row = this.stmts.getThread.get(id) as ThreadRow | undefined;
    return row ? toThread(row) : undefined;
  }

  getThreadByPlatformId(platform: string, platformThreadId: string): SocialThread | undefined {
    const row = this.stmts.getThreadByPlatformId.get(platform, platformThreadId) as
      | ThreadRow
      | undefined;
    return row ? toThread(row) : undefined;
  }

  /**
   * Upsert a message, returning the full row. Idempotent on
   * `(platform, platform_message_id)` — re-delivering the same message updates
   * its body/metadata in place rather than inserting a duplicate.
   */
  upsertMessage(input: UpsertMessageInput): SocialMessage {
    this.stmts.upsertMessage.run({
      platform: input.platform,
      platformMessageId: input.platformMessageId,
      threadId: input.threadId ?? null,
      contactId: input.contactId ?? null,
      direction: input.direction ?? "inbound",
      body: input.body,
      metadata: serializeMetadata(input.metadata),
      sentAt: input.sentAt ?? null
    });
    const row = this.stmts.getMessageByPlatformId.get(
      input.platform,
      input.platformMessageId
    ) as MessageRow;
    return toMessage(row);
  }

  getMessage(id: number): SocialMessage | undefined {
    const row = this.stmts.getMessage.get(id) as MessageRow | undefined;
    return row ? toMessage(row) : undefined;
  }

  getMessageByPlatformId(platform: string, platformMessageId: string): SocialMessage | undefined {
    const row = this.stmts.getMessageByPlatformId.get(platform, platformMessageId) as
      | MessageRow
      | undefined;
    return row ? toMessage(row) : undefined;
  }

  /** List messages in a thread, oldest first. */
  listMessagesByThread(threadId: number, limit = 100, offset = 0): SocialMessage[] {
    const rows = this.stmts.listMessagesByThread.all(threadId, limit, offset) as MessageRow[];
    return rows.map(toMessage);
  }
}
