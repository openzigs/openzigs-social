/**
 * Meta Graph API v25 HTTP client (#54).
 *
 * The single, typed, injectable HTTP client shared by every Meta surface in
 * Cohort A — Instagram, Facebook Pages, and Threads. It does NOT own retries,
 * rate limiting, or DLQ landing: those are platform-service concerns (#127)
 * applied by the callers via {@link MetaDispatcher}. The client's only jobs are:
 *
 *   1. Build a request against the configured Graph base URL.
 *   2. Carry the access token (in the query for GET, in the form body for POST)
 *      — never in a log line.
 *   3. Parse Meta's error envelope (`{ error: { message, type, code, ... } }`)
 *      into a typed {@link MetaGraphError} that flags whether the failure is
 *      *transient* (so callers can retry only those).
 *
 * Security (OWASP SSRF): the base URL is treated as untrusted config (BYOK) and
 * validated through the shared {@link assertSafeUrl} guard at construction, so a
 * mis-configured `graphBaseUrl` can never point the server at a private/loopback
 * address. Access tokens are never logged and never echoed.
 */
import { assertSafeUrl } from "../../server/setup/ssrf.js";

/** A `fetch`-shaped transport, injected so tests never hit the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Default Graph API version this connector targets. */
export const META_GRAPH_VERSION = "v25.0";
/** Default Graph host for Instagram + Facebook. */
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
/** Default Graph host for Threads (a distinct host from FB/IG). */
export const THREADS_GRAPH_BASE_URL = `https://graph.threads.net/${META_GRAPH_VERSION}`;

/** Meta's standard error envelope (subset we rely on). */
export interface MetaErrorEnvelope {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    is_transient?: boolean;
  };
}

/**
 * Meta error codes that callers should retry (rate limiting + transient
 * platform faults). Anything else (bad token, invalid param, permissions) is
 * terminal and must NOT be retried.
 */
const TRANSIENT_ERROR_CODES = new Set<number>([
  1, // API Unknown — transient
  2, // API Service — temporary
  4, // App-level rate limit
  17, // User-level rate limit
  32, // Page-level rate limit
  341, // Application limit reached
  368, // Temporarily blocked
  613 // Calls to this api have exceeded the rate limit
]);

/** A typed Graph API failure carrying enough to classify + redact. */
export class MetaGraphError extends Error {
  readonly httpStatus: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;
  readonly fbtraceId?: string;
  readonly transient: boolean;

  constructor(
    message: string,
    init: {
      httpStatus: number;
      code?: number;
      subcode?: number;
      type?: string;
      fbtraceId?: string;
      transient: boolean;
    }
  ) {
    super(message);
    this.name = "MetaGraphError";
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.subcode = init.subcode;
    this.type = init.type;
    this.fbtraceId = init.fbtraceId;
    this.transient = init.transient;
  }
}

/** True when an error should be retried by the platform-service retry helper. */
export function isTransientMetaError(err: unknown): boolean {
  return err instanceof MetaGraphError && err.transient;
}

/** Primitive query/body values accepted by the client. */
export type GraphParamValue = string | number | boolean | undefined | null;

export interface GraphRequestOptions {
  /** Access token for the call (kept out of logs). */
  accessToken: string;
  /** Query-string parameters (the access token is appended automatically). */
  query?: Record<string, GraphParamValue>;
  /** Form body parameters (POST only). */
  body?: Record<string, GraphParamValue>;
}

export interface MetaGraphClientOptions {
  /** Graph base URL incl. version, e.g. `https://graph.facebook.com/v25.0`. */
  baseUrl?: string;
  /** Injected transport. Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
}

function appendParams(url: URL, params: Record<string, GraphParamValue>): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
}

function toFormBody(params: Record<string, GraphParamValue>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    form.set(key, String(value));
  }
  return form;
}

/** Thin, typed wrapper over `fetch` for the Meta Graph API. */
export class MetaGraphClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: MetaGraphClientOptions = {}) {
    const base = opts.baseUrl ?? META_GRAPH_BASE_URL;
    // SSRF guard: refuse a base URL that resolves to loopback/private space.
    const parsed = assertSafeUrl(base);
    // Normalise: strip a trailing slash so `${base}${path}` is unambiguous.
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  /** Perform a GET against `path` (e.g. `/me/accounts`). */
  async get<T>(path: string, opts: GraphRequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  /** Perform a POST against `path` with a form-encoded body. */
  async post<T>(path: string, opts: GraphRequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: GraphRequestOptions
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    appendParams(url, opts.query ?? {});

    const init: RequestInit = { method, headers: { Accept: "application/json" } };
    if (method === "GET") {
      url.searchParams.set("access_token", opts.accessToken);
    } else {
      const form = toFormBody(opts.body ?? {});
      form.set("access_token", opts.accessToken);
      init.body = form;
      init.headers = {
        ...init.headers,
        "Content-Type": "application/x-www-form-urlencoded"
      };
    }

    const res = await this.fetchImpl(url.toString(), init);
    const text = await res.text();
    const json =
      text.length > 0 ? (safeParse(text) as MetaErrorEnvelope & Record<string, unknown>) : {};

    if (!res.ok || (json as MetaErrorEnvelope).error) {
      throw toGraphError(res.status, json as MetaErrorEnvelope);
    }
    return json as T;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function toGraphError(httpStatus: number, body: MetaErrorEnvelope): MetaGraphError {
  const err = body.error;
  const code = err?.code;
  const transient =
    err?.is_transient === true ||
    (code !== undefined && TRANSIENT_ERROR_CODES.has(code)) ||
    httpStatus === 429 ||
    httpStatus >= 500;
  return new MetaGraphError(err?.message ?? `Meta Graph request failed (HTTP ${httpStatus})`, {
    httpStatus,
    code,
    subcode: err?.error_subcode,
    type: err?.type,
    fbtraceId: err?.fbtrace_id,
    transient
  });
}
