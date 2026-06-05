/**
 * Backup restoration — decrypts a backup bundle produced by createBackup() and
 * restores the SQLite database and credential vault.
 *
 * Security: passphrase is NEVER logged, stored, or returned. A wrong passphrase
 * or corrupt bundle produces a typed RestoreError — no key material is included
 * in the error message.
 */
import { createDecipheriv } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { dbPath, vaultPath } from "../config/paths.js";
import {
  ALGO,
  deriveBackupKey,
  IV_LEN,
  SALT_LEN,
  TAG_LEN,
  SCRYPT_N,
  type BackupEnvelope
} from "./backup.js";

/** Minimum total size: salt + iv + tag must fit. */
const MIN_BUNDLE_LEN = SALT_LEN + IV_LEN + TAG_LEN + 1;

/** Typed error produced on wrong passphrase or corrupt bundle. */
export class RestoreError extends Error {
  constructor(
    message: string,
    readonly code: "wrong_passphrase" | "corrupt_bundle"
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export interface RestoreOptions {
  /** Override the database file path (used in tests). */
  dbFilePath?: string;
  /** Override the vault file path (used in tests). */
  vaultFilePath?: string;
  /** Override scrypt N parameter (for tests only — never set in production). */
  scryptN?: number;
}

/**
 * Restore a backup bundle created by createBackup().
 *
 * @throws {RestoreError} on wrong passphrase or malformed bundle.
 */
export async function restoreBackup(
  buf: Buffer,
  passphrase: string,
  opts?: RestoreOptions
): Promise<{ createdAt: string }> {
  if (!buf || buf.length < MIN_BUNDLE_LEN) {
    throw new RestoreError("backup: bundle too short or empty", "corrupt_bundle");
  }

  const resolvedDbPath = opts?.dbFilePath ?? dbPath();
  const resolvedVaultPath = opts?.vaultFilePath ?? vaultPath();

  // --- 1. Decrypt ---
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ct = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new RestoreError("backup: malformed bundle header", "corrupt_bundle");
  }

  let plaintext: string;
  try {
    const key = deriveBackupKey(passphrase, salt, opts?.scryptN ?? SCRYPT_N);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // AES-GCM auth failure === wrong passphrase or tampered ciphertext.
    throw new RestoreError(
      "backup: decryption failed — wrong passphrase or corrupt bundle",
      "wrong_passphrase"
    );
  }

  // --- 2. Parse envelope ---
  let envelope: BackupEnvelope;
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as BackupEnvelope).version !== "1" ||
      typeof (parsed as BackupEnvelope).db !== "string" ||
      typeof (parsed as BackupEnvelope).vault !== "string" ||
      typeof (parsed as BackupEnvelope).createdAt !== "string"
    ) {
      throw new Error("bad envelope shape");
    }
    envelope = parsed as BackupEnvelope;
  } catch {
    throw new RestoreError(
      "backup: envelope is malformed or has unexpected version",
      "corrupt_bundle"
    );
  }

  // --- 3. Restore vault ---
  const vaultBytes = Buffer.from(envelope.vault, "base64");
  if (vaultBytes.length > 0) {
    await mkdir(dirname(resolvedVaultPath), { recursive: true });
    await writeFile(resolvedVaultPath, vaultBytes, { mode: 0o600 });
    await chmod(resolvedVaultPath, 0o600);
  }

  // --- 4. Restore database via SQL exec ---
  // We replay the SQL dump rather than copying the file so the already-open
  // SQLite connection (if the server is running) stays valid.
  const sqlDump = Buffer.from(envelope.db, "base64").toString("utf8");
  if (sqlDump.trim().length > 0) {
    const db = new Database(resolvedDbPath);
    try {
      // Drop existing schema so the restore is clean.
      db.pragma("foreign_keys=OFF");
      // Get all user tables and drop them
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];
      for (const { name } of tables) {
        db.exec(`DROP TABLE IF EXISTS "${name}"`);
      }
      db.exec(sqlDump);
      db.pragma("foreign_keys=ON");
      db.pragma("wal_checkpoint(FULL)");
    } finally {
      db.close();
    }
  }

  return { createdAt: envelope.createdAt };
}
