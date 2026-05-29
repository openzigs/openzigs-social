/**
 * Stable per-browser client identifier.
 *
 * The server (`src/server/socket.ts`) uses the handshake `auth.clientId` to
 * restore (or create) a transcript session keyed by that id. We persist a
 * single clean UUID in localStorage so reconnects resume the same session.
 */
export const CLIENT_ID_STORAGE_KEY = "openzigs-client-id";

/** RFC 4122 v4 UUID matcher — the only shape we ever send to the server. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Return the persisted client id, generating and storing a fresh UUID when one
 * is missing or malformed. Always returns a clean v4 UUID (never an oversized
 * or path-traversal value).
 */
export function getClientId(): string {
  if (typeof window === "undefined") {
    return generateUuid();
  }

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (stored !== null && UUID_RE.test(stored)) {
    return stored;
  }

  const fresh = generateUuid();
  try {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, fresh);
  } catch {
    // Ignore storage failures (private mode, quota) — the id is still usable.
  }
  return fresh;
}

/** Persist a server-assigned session id as the canonical client id. */
export function persistClientId(id: string): void {
  if (typeof window === "undefined" || !UUID_RE.test(id)) {
    return;
  }
  try {
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
  } catch {
    // Ignore storage failures.
  }
}
