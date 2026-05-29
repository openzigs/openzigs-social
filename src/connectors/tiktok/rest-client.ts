/**
 * TikTok Open API v2 REST client (#64).
 *
 * The single typed, injectable HTTP client shared by the TikTok publisher (#64)
 * and display poller (#64). Mirrors the Meta/LinkedIn/Pinterest clients: it
 * owns NO retry, rate-limit, or DLQ machinery — those are platform-service
 * concerns (#127) applied by callers through the {@link TikTokDispatcher}.
 *
 * Unlike the others, TikTok returns HTTP 200 even for logical failures and
 * carries the status in an `error` envelope: `{ error: { code, message,
 * log_id } }` where `code === "ok"` means success. This client surfaces a
 * non-`ok` business error as a {@link TikTokApiError} in addition to mapping
 * HTTP transport failures.
 *
 * Security (OWASP SSRF): the base URL is untrusted config (BYOK) and
 * SSRF-validated at construction; access tokens are never logged.
 */
import { assertSafeUrl } from "../../server/setup/ssrf.js";

/** A `fetch`-shaped transport, injected so tests never hit the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Default TikTok Open API v2 base host. */
export const TIKTOK_API_BASE_URL = "https://open.tiktokapis.com/v2";

/** TikTok's standard error envelope. */
export interface TikTokErrorEnvelope {
  code?: string;
  message?: string;
  log_id?: string;
}

/** A typed TikTok API failure carrying enough to classify + redact. */
export class TikTokApiError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly transient: boolean;

  constructor(message: string, init: { httpStatus: number; code?: string; transient: boolean }) {
    super(message);
    this.name = "TikTokApiError";
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.transient = init.transient;
  }
}

/** Business error codes TikTok marks as retryable. */
const TRANSIENT_BUSINESS_CODES = new Set(["rate_limit_exceeded", "internal_error"]);

/** True when an error should be retried by the platform-service retry helper. */
export function isTransientTikTokError(err: unknown): boolean {
  return err instanceof TikTokApiError && err.transient;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface TikTokRequestOptions {
  accessToken: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export interface TikTokRestClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

interface TikTokResponse<T> {
  data?: T;
  error?: TikTokErrorEnvelope;
}

function appendQuery(url: URL, params: Record<string, QueryValue>): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Thin, typed wrapper over `fetch` for the TikTok Open API v2. */
export class TikTokRestClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: TikTokRestClientOptions = {}) {
    const base = opts.baseUrl ?? TIKTOK_API_BASE_URL;
    const parsed = assertSafeUrl(base);
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async get<T>(path: string, opts: TikTokRequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  async post<T>(path: string, opts: TikTokRequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: TikTokRequestOptions
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    appendQuery(url, opts.query ?? {});

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${opts.accessToken}`
    };
    const init: RequestInit = { method, headers };
    if (method === "POST") {
      headers["Content-Type"] = "application/json; charset=UTF-8";
      init.body = JSON.stringify(opts.body ?? {});
    }

    const res = await this.fetchImpl(url.toString(), init);
    const text = await res.text();
    const json = (text.length > 0 ? safeParse(text) : {}) as TikTokResponse<T>;

    if (!res.ok) {
      throw new TikTokApiError(
        json.error?.message ?? `TikTok request failed (HTTP ${res.status})`,
        {
          httpStatus: res.status,
          code: json.error?.code,
          transient: res.status === 429 || res.status >= 500
        }
      );
    }

    // TikTok returns 200 even for business errors — inspect the envelope.
    const code = json.error?.code;
    if (code && code !== "ok") {
      throw new TikTokApiError(json.error?.message ?? `TikTok error: ${code}`, {
        httpStatus: res.status,
        code,
        transient: TRANSIENT_BUSINESS_CODES.has(code)
      });
    }

    return (json.data ?? ({} as T)) as T;
  }
}
