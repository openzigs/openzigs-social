/**
 * Conversation transcript sessions.
 *
 * Each session is an append-only JSONL ledger at
 * `<dataDir>/sessions/<id>.jsonl` with a JSON metadata sidecar at
 * `<dataDir>/sessions/<id>.meta.json` (createdAt, lastActiveAt, title,
 * messageCount).
 *
 * These are distinct from the in-memory Copilot `SessionManager`
 * (`src/copilot/session-manager.ts`): those track token usage for a live
 * LLM exchange, whereas these persist durable conversation transcripts.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { sessionsDir } from "../config/paths.js";

export type TranscriptRole = "user" | "assistant" | "system" | "tool";

export interface TranscriptEntry {
  timestamp: string;
  role: TranscriptRole;
  content: string;
  metadata?: Record<string, unknown>;
}

export type TranscriptEntryInput = Omit<TranscriptEntry, "timestamp"> & {
  timestamp?: string;
};

export interface TranscriptMeta {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  title: string;
  messageCount: number;
}

export interface SessionData {
  meta: TranscriptMeta;
  entries: TranscriptEntry[];
}

const DIR_MODE = 0o700;
const ID_RE = /^[A-Za-z0-9_-]+$/;

export interface TranscriptManagerOptions {
  /** Override the sessions directory (tests). */
  dir?: string;
  /** Injectable clock (tests). */
  clock?: () => Date;
}

export class TranscriptManager {
  private readonly dir: string;
  private readonly clock: () => Date;
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: TranscriptManagerOptions = {}) {
    this.dir = opts.dir ?? sessionsDir();
    this.clock = opts.clock ?? (() => new Date());
  }

  private assertId(id: string): void {
    if (!ID_RE.test(id)) {
      throw new Error(`session: invalid id ${JSON.stringify(id)}`);
    }
  }

  private ledgerPath(id: string): string {
    return join(this.dir, `${id}.jsonl`);
  }

  private metaPath(id: string): string {
    return join(this.dir, `${id}.meta.json`);
  }

  /** Serialise filesystem mutations so concurrent calls never interleave. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** Create a new session with an empty ledger + sidecar. */
  async create(opts: { title?: string; id?: string } = {}): Promise<TranscriptMeta> {
    const id = opts.id ?? randomUUID();
    this.assertId(id);
    return this.enqueue(async () => {
      if (existsSync(this.metaPath(id))) {
        throw new Error(`session: ${id} already exists`);
      }
      await mkdir(this.dir, { mode: DIR_MODE, recursive: true });
      const now = this.clock().toISOString();
      const meta: TranscriptMeta = {
        id,
        createdAt: now,
        lastActiveAt: now,
        title: opts.title ?? "Untitled session",
        messageCount: 0
      };
      await writeFile(this.ledgerPath(id), "", { mode: 0o600 });
      await writeFile(this.metaPath(id), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
      return meta;
    });
  }

  /** List all session metadata, newest activity first. */
  async list(): Promise<TranscriptMeta[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const ids = files
      .filter((f) => f.endsWith(".meta.json"))
      .map((f) => f.slice(0, -".meta.json".length));
    const metas = await Promise.all(ids.map((id) => this.readMeta(id)));
    return metas
      .filter((m): m is TranscriptMeta => m !== null)
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  private async readMeta(id: string): Promise<TranscriptMeta | null> {
    try {
      return JSON.parse(await readFile(this.metaPath(id), "utf8")) as TranscriptMeta;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  /** Load a session's metadata + full transcript. */
  async load(id: string): Promise<SessionData> {
    this.assertId(id);
    const meta = await this.readMeta(id);
    if (meta === null) throw new Error(`session: not found: ${id}`);
    const raw = await readFile(this.ledgerPath(id), "utf8");
    const entries = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as TranscriptEntry);
    return { meta, entries };
  }

  /** Append an entry, bumping messageCount + lastActiveAt. */
  async append(id: string, input: TranscriptEntryInput): Promise<TranscriptEntry> {
    this.assertId(id);
    return this.enqueue(async () => {
      const meta = await this.readMeta(id);
      if (meta === null) throw new Error(`session: not found: ${id}`);
      const entry: TranscriptEntry = {
        timestamp: input.timestamp ?? this.clock().toISOString(),
        role: input.role,
        content: input.content,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {})
      };
      await writeFile(this.ledgerPath(id), `${JSON.stringify(entry)}\n`, {
        flag: "a",
        mode: 0o600
      });
      const next: TranscriptMeta = {
        ...meta,
        lastActiveAt: this.clock().toISOString(),
        messageCount: meta.messageCount + 1
      };
      await writeFile(this.metaPath(id), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      return entry;
    });
  }

  /** Rename a session's title. */
  async renameTitle(id: string, title: string): Promise<TranscriptMeta> {
    this.assertId(id);
    return this.enqueue(async () => {
      const meta = await this.readMeta(id);
      if (meta === null) throw new Error(`session: not found: ${id}`);
      const next: TranscriptMeta = { ...meta, title };
      await writeFile(this.metaPath(id), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      return next;
    });
  }

  /** Delete a session's ledger + sidecar. No-op if already gone. */
  async delete(id: string): Promise<void> {
    this.assertId(id);
    await this.enqueue(async () => {
      await rm(this.ledgerPath(id), { force: true });
      await rm(this.metaPath(id), { force: true });
    });
  }

  /** Rename the underlying session id (ledger + sidecar files). */
  async renameId(id: string, newId: string): Promise<TranscriptMeta> {
    this.assertId(id);
    this.assertId(newId);
    return this.enqueue(async () => {
      const meta = await this.readMeta(id);
      if (meta === null) throw new Error(`session: not found: ${id}`);
      if (existsSync(this.metaPath(newId))) throw new Error(`session: ${newId} already exists`);
      await rename(this.ledgerPath(id), this.ledgerPath(newId));
      const next: TranscriptMeta = { ...meta, id: newId };
      await writeFile(this.metaPath(newId), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      await rm(this.metaPath(id), { force: true });
      return next;
    });
  }
}
