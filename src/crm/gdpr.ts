/**
 * GDPR right-to-delete (epic #90, sub #138).
 *
 * Implements the {@link deleteContact} function which purges a CRM identity and
 * all its related data in a single SQLite transaction:
 *
 *   - `crm_contacts` row (triggers `crm_contact_links` cascade via FK).
 *   - `social_messages` for every linked `social_contacts` row.
 *   - `auto_reply_audit` rows whose `contact_id` references this CRM identity.
 *   - `platform_insights_raw` rows whose `object_id` is a linked platform
 *     contact's `platform_contact_id`.
 *   - When `cascadeMerges: true`: `crm_contact_merges` rows where this contact
 *     was the survivor (audit trail of contacts merged into it).
 *
 * When `cascadeMerges: false` and the contact has merge history (it was a
 * survivor), {@link GdprDeleteError} with `status: 409` is thrown so the caller
 * must re-request with `cascade=true`.
 *
 * Returns a {@link GdprDeleteReceipt} JSON object with per-table row counts and
 * an ISO-8601 `deletedAt` timestamp.
 */
import type { Database } from "better-sqlite3";

/** Per-table deletion counts for the audit receipt. */
export interface GdprDeleteRowCounts {
  contacts: number;
  social_messages: number;
  auto_reply_audit: number;
  platform_insights_raw: number;
  merged_contacts?: number;
}

/** Receipt returned from a successful GDPR delete. */
export interface GdprDeleteReceipt {
  /** ISO-8601 timestamp of the deletion. */
  deletedAt: string;
  /** The string-cast id of the deleted CRM contact. */
  contactId: string;
  rowsDeleted: GdprDeleteRowCounts;
}

/** Thrown by {@link deleteContact} for 404 (not found) and 409 (merge conflict). */
export class GdprDeleteError extends Error {
  readonly status: 404 | 409;

  constructor(message: string, status: 404 | 409) {
    super(message);
    this.name = "GdprDeleteError";
    this.status = status;
  }
}

export interface DeleteContactOptions {
  /** When true, also delete `crm_contact_merges` rows for this contact. */
  cascadeMerges: boolean;
}

/**
 * Delete a CRM contact and all its related data inside a single transaction.
 *
 * @throws {GdprDeleteError} status 404 if the contact doesn't exist.
 * @throws {GdprDeleteError} status 409 if the contact has merge history and
 *   `cascadeMerges: false`.
 */
export function deleteContact(
  db: Database,
  id: number,
  options: DeleteContactOptions
): GdprDeleteReceipt {
  // Check existence first (outside transaction — avoids nested transaction edge
  // cases with better-sqlite3).
  const exists = db.prepare(`SELECT id FROM crm_contacts WHERE id = ?`).get(id);
  if (!exists) {
    throw new GdprDeleteError(`contact ${id} not found`, 404);
  }

  // Check merge history guard (409) when cascade is not requested.
  if (!options.cascadeMerges) {
    const mergeCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM crm_contact_merges WHERE survivor_id = ?`).get(id) as {
        n: number;
      }
    ).n;
    if (mergeCount > 0) {
      throw new GdprDeleteError(
        `contact ${id} has ${mergeCount} merge record(s); re-request with cascade=true`,
        409
      );
    }
  }

  // Resolve linked social_contact_ids and their platform_contact_ids before we
  // start deleting (the FK cascade on crm_contact_links would wipe the join
  // data mid-transaction otherwise).
  const linkedRows = db
    .prepare(
      `SELECT l.social_contact_id, c.platform_contact_id
       FROM crm_contact_links l
       JOIN social_contacts c ON c.id = l.social_contact_id
       WHERE l.crm_contact_id = ?`
    )
    .all(id) as Array<{ social_contact_id: number; platform_contact_id: string }>;

  const socialIds = linkedRows.map((r) => r.social_contact_id);
  const platformContactIds = linkedRows.map((r) => r.platform_contact_id);

  const receipt: GdprDeleteReceipt = {
    deletedAt: new Date().toISOString(),
    contactId: String(id),
    rowsDeleted: {
      contacts: 0,
      social_messages: 0,
      auto_reply_audit: 0,
      platform_insights_raw: 0
    }
  };

  const tx = db.transaction(() => {
    let msgDeleted = 0;
    if (socialIds.length > 0) {
      const placeholders = socialIds.map(() => "?").join(",");
      msgDeleted = db
        .prepare(`DELETE FROM social_messages WHERE contact_id IN (${placeholders})`)
        .run(...socialIds).changes;
    }

    let insightDeleted = 0;
    if (platformContactIds.length > 0) {
      const placeholders = platformContactIds.map(() => "?").join(",");
      insightDeleted = db
        .prepare(`DELETE FROM platform_insights_raw WHERE object_id IN (${placeholders})`)
        .run(...platformContactIds).changes;
    }

    const auditDeleted = db
      .prepare(`DELETE FROM auto_reply_audit WHERE contact_id = ?`)
      .run(id).changes;

    let mergeDeleted = 0;
    if (options.cascadeMerges) {
      mergeDeleted = db
        .prepare(`DELETE FROM crm_contact_merges WHERE survivor_id = ?`)
        .run(id).changes;
    }

    // Delete the CRM contact — cascades to crm_contact_links via FK.
    const contactDeleted = db.prepare(`DELETE FROM crm_contacts WHERE id = ?`).run(id).changes;

    receipt.rowsDeleted = {
      contacts: contactDeleted,
      social_messages: msgDeleted,
      auto_reply_audit: auditDeleted,
      platform_insights_raw: insightDeleted,
      ...(options.cascadeMerges ? { merged_contacts: mergeDeleted } : {})
    };
  });

  tx();
  return receipt;
}
