/**
 * Server-side BYOK key validation (setup wizard, sub #103).
 *
 * The browser NEVER calls the provider with the user's key directly. The UI
 * posts the key to `POST /api/setup/validate-key`; this module performs a
 * lightweight authenticated `GET /models` request from the server and reports
 * only whether the key is valid. The key is never logged nor returned.
 */
import { assertSafeUrl } from "./ssrf.js";

export type SetupProvider = "openai" | "anthropic" | "openai-compatible";

export const SETUP_PROVIDERS: readonly SetupProvider[] = [
  "openai",
  "anthropic",
  "openai-compatible"
];

const ANTHROPIC_VERSION = "2023-06-01";
const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1";
const ANTHROPIC_DEFAULT_BASE = "https://api.anthropic.com";

export interface ValidateKeyInput {
  provider: SetupProvider;
  apiKey: string;
  /** Required for `openai-compatible`; ignored for openai/anthropic. */
  baseUrl?: string;
}

export interface ValidateKeyResult {
  valid: boolean;
  /** Upstream HTTP status, when a request was made. */
  status?: number;
  /** Human-readable reason on failure. Never contains the key. */
  reason?: string;
}

type FetchLike = typeof fetch;

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Build the `/models` request for a given provider. Throws on bad input. */
function buildRequest(input: ValidateKeyInput): { url: string; headers: Record<string, string> } {
  switch (input.provider) {
    case "openai": {
      const base = stripTrailingSlash(OPENAI_DEFAULT_BASE);
      return { url: `${base}/models`, headers: { authorization: `Bearer ${input.apiKey}` } };
    }
    case "anthropic": {
      const base = stripTrailingSlash(ANTHROPIC_DEFAULT_BASE);
      return {
        url: `${base}/v1/models`,
        headers: { "x-api-key": input.apiKey, "anthropic-version": ANTHROPIC_VERSION }
      };
    }
    case "openai-compatible": {
      if (!input.baseUrl || input.baseUrl.trim().length === 0) {
        throw new Error("baseUrl is required for openai-compatible");
      }
      // SSRF guard: refuse loopback / link-local / private targets.
      const parsed = assertSafeUrl(input.baseUrl.trim());
      const base = stripTrailingSlash(parsed.toString());
      return { url: `${base}/models`, headers: { authorization: `Bearer ${input.apiKey}` } };
    }
    default: {
      const exhaustive: never = input.provider;
      throw new Error(`unknown provider ${String(exhaustive)}`);
    }
  }
}

/**
 * Validate a BYOK key by hitting the provider's `/models` endpoint. Returns a
 * boolean envelope; transport errors resolve to `{ valid: false }` rather than
 * throwing so the route can always answer the client cleanly. Boundary errors
 * (missing/invalid baseUrl, blocked host) are surfaced as thrown errors for the
 * route to map to a 400.
 */
export async function validateProviderKey(
  input: ValidateKeyInput,
  fetchImpl: FetchLike = fetch
): Promise<ValidateKeyResult> {
  const { url, headers } = buildRequest(input);
  try {
    // SSRF hardening: never auto-follow redirects. A hostile openai-compatible
    // endpoint could 3xx us to an internal/metadata host that the pre-flight
    // guard already cleared. With `redirect: "manual"` a real fetch yields an
    // opaque-redirect response (status 0) instead of chasing the Location.
    const res = await fetchImpl(url, { method: "GET", headers, redirect: "manual" });
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      return { valid: false, status: res.status, reason: "provider attempted a redirect" };
    }
    if (res.ok) return { valid: true, status: res.status };
    return { valid: false, status: res.status, reason: `provider returned HTTP ${res.status}` };
  } catch {
    // Never include the underlying error — it could echo request details.
    return { valid: false, reason: "could not reach provider" };
  }
}
