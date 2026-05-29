/**
 * Append-only audit logger.
 *
 * Writes one JSON object per line (JSONL) to `<dataDir>/audit/audit.jsonl`.
 * Every entry is redacted via {@link redact} before serialisation, so secret
 * material is never persisted. Entries are categorised so downstream tooling
 * can filter (`auth`, `publish`, `inbound`, `config`, `vault`, `oauth`).
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

import { auditDir } from "../config/paths.js";
import { redact } from "./redact.js";

export const AUDIT_CATEGORIES = ["auth", "publish", "inbound", "config", "vault", "oauth"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface AuditEntryInput {
  category: AuditCategory;
  event: string;
  /** Free-form, redacted before write. */
  details?: Record<string, unknown>;
  /** Optional correlation ids. */
  sessionId?: string;
  actor?: string;
}

export interface AuditEntry extends AuditEntryInput {
  id: string;
  timestamp: string;
}

const AUDIT_DIR_MODE = 0o700;
const AUDIT_FILE = "audit.jsonl";

export interface AuditLoggerOptions {
  /** Override the audit directory (tests). */
  dir?: string;
  /** Injectable clock (tests). */
  clock?: () => Date;
}

export class AuditLogger {
  private readonly filePath: string;
  private readonly clock: () => Date;
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: AuditLoggerOptions = {}) {
    this.filePath = join(opts.dir ?? auditDir(), AUDIT_FILE);
    this.clock = opts.clock ?? (() => new Date());
  }

  /** Where audit lines are written. */
  get path(): string {
    return this.filePath;
  }

  /**
   * Append a redacted audit entry. Writes are serialised so concurrent calls
   * never interleave a partial line.
   */
  async log(input: AuditEntryInput): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: this.clock().toISOString(),
      category: input.category,
      event: input.event,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.actor !== undefined ? { actor: input.actor } : {}),
      ...(input.details !== undefined ? { details: redact(input.details) } : {})
    };
    const line = `${JSON.stringify(entry)}\n`;
    this.chain = this.chain.then(async () => {
      await mkdir(dirname(this.filePath), { mode: AUDIT_DIR_MODE, recursive: true });
      await appendFile(this.filePath, line, { mode: 0o600 });
    });
    await this.chain;
    return entry;
  }

  /** Read all audit entries (chronological). Empty when the file is absent. */
  async read(): Promise<AuditEntry[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as AuditEntry);
  }
}
