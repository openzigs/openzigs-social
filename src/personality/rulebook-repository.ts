/**
 * Brand-voice rulebook repository (epic #78, #79).
 *
 * Persists the single workspace brand-voice rulebook in the `brand_voice_rulebook`
 * table (migration 0008). There is exactly one row, pinned to `id = 1` by a CHECK
 * constraint, so {@link BrandVoiceRepository.save} is an idempotent upsert and
 * {@link BrandVoiceRepository.get} either returns that row or the empty default.
 *
 * Lists are JSON-encoded at the column boundary (mirroring the outbox media and
 * inbox rule repos). Every statement is a parameterized prepared statement (A03).
 */
import type { Database, Statement } from "better-sqlite3";

import { EMPTY_RULEBOOK, type BrandVoiceRulebook } from "./types.js";

interface RulebookRow {
  id: number;
  tone: string;
  banned_words_json: string;
  exemplars_json: string;
  updated_at: number;
}

/** Parse a JSON column into an array of trimmed, non-empty strings. */
function parseStringList(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function toRulebook(row: RulebookRow): BrandVoiceRulebook {
  return {
    tone: row.tone,
    bannedWords: parseStringList(row.banned_words_json),
    exemplars: parseStringList(row.exemplars_json)
  };
}

/** Normalise a raw rulebook input: trim strings, drop empties, dedupe lists. */
export function normalizeRulebook(input: BrandVoiceRulebook): BrandVoiceRulebook {
  const dedupe = (values: string[]): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of values) {
      const value = raw.trim();
      const key = value.toLowerCase();
      if (value.length === 0 || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
    return out;
  };
  return {
    tone: input.tone.trim(),
    bannedWords: dedupe(input.bannedWords),
    exemplars: dedupe(input.exemplars)
  };
}

export interface BrandVoiceRepositoryOptions {
  /** Injectable clock (epoch ms) for deterministic timestamps in tests. */
  now?: () => number;
}

export class BrandVoiceRepository {
  private readonly now: () => number;
  private readonly getStmt: Statement;
  private readonly upsertStmt: Statement;

  constructor(db: Database, opts: BrandVoiceRepositoryOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.getStmt = db.prepare(`SELECT * FROM brand_voice_rulebook WHERE id = 1`);
    this.upsertStmt = db.prepare(
      `INSERT INTO brand_voice_rulebook
         (id, tone, banned_words_json, exemplars_json, updated_at)
       VALUES
         (1, @tone, @bannedWordsJson, @exemplarsJson, @now)
       ON CONFLICT(id) DO UPDATE SET
         tone = excluded.tone,
         banned_words_json = excluded.banned_words_json,
         exemplars_json = excluded.exemplars_json,
         updated_at = excluded.updated_at`
    );
  }

  /** Read the rulebook, or the empty default when none has been saved yet. */
  get(): BrandVoiceRulebook {
    const row = this.getStmt.get() as RulebookRow | undefined;
    return row ? toRulebook(row) : { ...EMPTY_RULEBOOK };
  }

  /** Upsert the single workspace rulebook and return the normalised result. */
  save(input: BrandVoiceRulebook): BrandVoiceRulebook {
    const normalized = normalizeRulebook(input);
    this.upsertStmt.run({
      tone: normalized.tone,
      bannedWordsJson: JSON.stringify(normalized.bannedWords),
      exemplarsJson: JSON.stringify(normalized.exemplars),
      now: this.now()
    });
    return normalized;
  }
}
