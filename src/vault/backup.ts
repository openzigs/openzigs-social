/**
 * Backup creation — exports an encrypted binary bundle containing both the
 * SQLite database (WAL-checkpointed SQL dump) and the credential vault
 * (auth.json).
 *
 * Bundle format (plaintext before encryption):
 *   JSON { version: "1", createdAt: ISO, db: <base64 SQL>, vault: <base64 bytes> }
 *
 * Encryption:
 *   AES-256-GCM, key derived from passphrase via scrypt (N=2^17, r=8, p=1).
 *   Output: [32-byte salt][12-byte IV][16-byte auth tag][ciphertext]
 *
 * Security: passphrase is NEVER logged or stored. All crypto is node built-in.
 */
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import Database from "better-sqlite3";

import { dbPath, vaultPath } from "../config/paths.js";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 32;

/** scrypt parameters — deliberately slow for passphrase-based KDF. */
export const SCRYPT_N = 131072; // 2^17
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;

/** Lower-security scrypt params used only in unit tests (never in production). */
export const SCRYPT_N_TEST = 1024;

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** Minimum passphrase length enforced at this layer too (belt-and-suspenders). */
export const MIN_PASSPHRASE_LEN = 8;

export interface BackupOptions {
  /** Passphrase used to derive the encryption key. Min 8 chars. */
  passphrase: string;
  /** Override the database file path (used in tests). */
  dbFilePath?: string;
  /** Override the vault file path (used in tests). */
  vaultFilePath?: string;
  /** Override scrypt N parameter (for tests only — never set in production). */
  scryptN?: number;
}

/** Derive a 32-byte key from a passphrase + salt using scrypt. */
function deriveBackupKey(passphrase: string, salt: Buffer, scryptN = SCRYPT_N): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, {
    N: scryptN,
    r: SCRYPT_R,
    p: SCRYPT_P
  }) as Buffer;
}

/**
 * Produce an encrypted backup bundle as a raw Buffer.
 *
 * The bundle contains a WAL-checkpoint SQL dump of the SQLite DB and the raw
 * vault bytes. The passphrase is only used to derive the key; it is never
 * stored or returned.
 */
export async function createBackup(opts: BackupOptions): Promise<Buffer> {
  const passphrase = opts.passphrase;
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LEN) {
    throw new Error("backup: passphrase must be at least 8 characters");
  }

  const resolvedDbPath = opts.dbFilePath ?? dbPath();
  const resolvedVaultPath = opts.vaultFilePath ?? vaultPath();

  // --- 1. Dump the SQLite database ---
  // Open a separate connection, WAL-checkpoint, then dump to SQL text.
  let sqlDump: string;
  {
    const db = new Database(resolvedDbPath);
    try {
      // Force a WAL checkpoint so the dump captures all committed data.
      db.pragma("wal_checkpoint(FULL)");
      const rows = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name"
        )
        .all() as { sql: string }[];

      const lines: string[] = ["PRAGMA foreign_keys=OFF;", "BEGIN TRANSACTION;"];
      // Emit schema
      for (const row of rows) {
        lines.push(row.sql + ";");
      }
      // Emit data for every user table
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
      for (const { name } of tables) {
        const dataRows = db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
        for (const dataRow of dataRows) {
          const cols = Object.keys(dataRow)
            .map((c) => `"${c}"`)
            .join(", ");
          const vals = Object.values(dataRow)
            .map((v) => {
              if (v === null) return "NULL";
              if (typeof v === "number") return String(v);
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(", ");
          lines.push(`INSERT INTO "${name}" (${cols}) VALUES (${vals});`);
        }
      }
      lines.push("COMMIT;");
      sqlDump = lines.join("\n");
    } finally {
      db.close();
    }
  }

  // --- 2. Read vault bytes ---
  let vaultBytes: Buffer;
  if (existsSync(resolvedVaultPath)) {
    vaultBytes = await readFile(resolvedVaultPath);
  } else {
    // Fresh install — vault may not exist yet; include an empty placeholder.
    vaultBytes = Buffer.alloc(0);
  }

  // --- 3. Build the plaintext envelope ---
  const envelope = JSON.stringify({
    version: "1",
    createdAt: new Date().toISOString(),
    db: Buffer.from(sqlDump).toString("base64"),
    vault: vaultBytes.toString("base64")
  });

  // --- 4. Encrypt with AES-256-GCM ---
  const salt = randomBytes(SALT_LEN);
  const key = deriveBackupKey(passphrase, salt, opts.scryptN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(envelope, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Layout: [salt(32)][iv(12)][tag(16)][ciphertext]
  return Buffer.concat([salt, iv, tag, ct]);
}

// Re-export for restore module use
export { deriveBackupKey, SALT_LEN, IV_LEN, TAG_LEN, KEY_LEN, ALGO };

export interface BackupEnvelope {
  version: "1";
  createdAt: string;
  /** Base64-encoded SQL dump */
  db: string;
  /** Base64-encoded raw vault bytes */
  vault: string;
}
