/**
 * X (Twitter) v2 REST client — Cohort C (#66, sub #67/#68).
 *
 * The single, typed, injectable HTTP client shared by every X surface: the
 * tweet publisher (#68), the DM sender + inbox poller (#68), and the analytics
 * poller (#68). Like the LinkedIn `rest-client.ts` and the Meta `graph-client`
 * it owns NO retry, rate-limit, or DLQ machinery — those are platform-service
 * concerns (#127) applied by callers through {@link TwitterDispatcher}. Its jobs:
 *
 *   1. Build a request against the configured X v2 API base URL.
 *   2. Carry the per-account OAuth 2.0 user access token as a Bearer header —
 *      never in a log line and never in the query string.
 *   3. Parse X's v2 error envelope (`{ title, detail, type, status, errors }`)
 *      into a typed {@link TwitterApiError} that flags whether the failure is
 *      *transient* (so callers retry only those).
 *
 * Security (OWASP SSRF): the base URL is treated as untrusted config (BYOK) and
 * validated through the shared {@link assertSafeUrl} guard at construction, so a
 * mis-configured `apiBaseUrl` can never point the server at a private/loopback
 * address. Access tokens are never logged and never echoed.
 */
import { assertSafeUrl } from "../../server/setup/ssrf.js";

/** A `fetch`-shaped transport, injected so tests never hit the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Default X v2 API base host. */
export const TWITTER_API_BASE_URL = "https://api.twitter.com/2";

/** X v2 error envelope (subset we rely on). */
export interface TwitterErrorEnvelope {
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
  errors?: Array<{ message?: string; code?: number }>;
}

/** A typed X API failure carrying enough to classify + redact. */
export class TwitterApiError extends Error {
  readonly httpStatus: number;
  readonly type?: string;
  readonly transient: boolean;

  constructor(message: string, init: { httpStatus: number; type?: string; transient: boolean }) {
    super(message);
    this.name = "TwitterApiError";
    this.httpStatus = init.httpStatus;
    this.type = init.type;
    this.transient = init.transient;
  }
}

/** True when an error should be retried by the platform-service retry helper. */
export function isTransientTwitterError(err: unknown): boolean {
  return err instanceof TwitterApiError && err.transient;
}

/** Primitive query values accepted by the client. */
export type QueryValue = string | number | boolean | undefined | null;

export interface TwitterRequestOptions {
  /** Per-account user access token for the call (kept out of logs). */
  accessToken: string;
  /** Query-string parameters. */
  query?: Record<string, QueryValue>;
  /** JSON request body (POST/PUT only). */
  body?: unknown;
}

export interface TwitterRestClientOptions {
  /** API base URL incl. the `/2` version path, e.g. `https://api.twitter.com/2`. */
  baseUrl?: string;
  /** Injected transport. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
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

function toApiError(httpStatus: number, body: TwitterErrorEnvelope): TwitterApiError {
  const transient = httpStatus === 429 || httpStatus >= 500;
  const message =
    body.detail ??
    body.title ??
    body.errors?.[0]?.message ??
    `X request failed (HTTP ${httpStatus})`;
  return new TwitterApiError(message, { httpStatus, type: body.type, transient });
}

/** Thin, typed wrapper over `fetch` for the X v2 REST API. */
export class TwitterRestClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: TwitterRestClientOptions = {}) {
    const base = opts.baseUrl ?? TWITTER_API_BASE_URL;
    // SSRF guard: refuse a base URL that resolves to loopback/private space.
    const parsed = assertSafeUrl(base);
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  /** Perform a GET against `path` (e.g. `/dm_events`). */
  async get<T>(path: string, opts: TwitterRequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  /** Perform a POST against `path` with a JSON body. */
  async post<T>(path: string, opts: TwitterRequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: TwitterRequestOptions
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    appendQuery(url, opts.query ?? {});

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${opts.accessToken}`
    };
    const init: RequestInit = { method, headers };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body ?? {});
    }

    const res = await this.fetchImpl(url.toString(), init);
    const text = await res.text();
    const json = text.length > 0 ? (safeParse(text) as TwitterErrorEnvelope) : {};

    if (!res.ok) {
      throw toApiError(res.status, json);
    }
    return json as T;
  }
}
