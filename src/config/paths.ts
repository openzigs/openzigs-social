/**
 * Single source of truth for the on-disk data directory.
 *
 * Every persistence concern (vault, sessions, sqlite, logs, audit) MUST derive
 * its paths from {@link resolveDataDir}. Never hardcode `~/.openzigs-social/`.
 *
 * Resolution order:
 *   1. `OPENZIGS_SOCIAL_HOME` env override (used by the Tauri sandboxed-macOS
 *      build and by tests, which point it at a tmp dir).
 *   2. `~/.openzigs-social/` (dev + docker default).
 *
 * See docs/adr/0001-process-topology.md for the rationale.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** Env var that overrides the data directory root. */
export const DATA_DIR_ENV = "OPENZIGS_SOCIAL_HOME";

/** Default data directory when no override is present. */
export function defaultDataDir(): string {
  return join(homedir(), ".openzigs-social");
}

/**
 * Resolve the data directory root. Reads {@link DATA_DIR_ENV} dynamically so
 * tests can repoint it per-case without module reloads.
 */
export function resolveDataDir(): string {
  const override = process.env[DATA_DIR_ENV]?.trim();
  return override && override.length > 0 ? override : defaultDataDir();
}

/** `<dataDir>/logs` — Winston rotating file transport target. */
export function logsDir(): string {
  return join(resolveDataDir(), "logs");
}

/** `<dataDir>/audit` — append-only audit JSONL target. */
export function auditDir(): string {
  return join(resolveDataDir(), "audit");
}

/** `<dataDir>/sessions` — conversation transcript JSONL + sidecars. */
export function sessionsDir(): string {
  return join(resolveDataDir(), "sessions");
}

/** `<dataDir>/openzigs-social.db` — SQLite database file. */
export function dbPath(): string {
  return join(resolveDataDir(), "openzigs-social.db");
}

/** `<dataDir>/auth.json` — credential vault file. */
export function vaultPath(): string {
  return join(resolveDataDir(), "auth.json");
}

/** `<dataDir>/user.json` — user config override layer. */
export function userConfigPath(): string {
  return join(resolveDataDir(), "user.json");
}
