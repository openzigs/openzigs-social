/**
 * Pinterest v5 REST API client (#63).
 *
 * The single typed, injectable HTTP client shared by the Pinterest publisher
 * (#63) and analytics poller (#63). Mirrors the Meta `graph-client.ts` / the
 * LinkedIn `rest-client.ts`: it owns NO retry, rate-limit, or DLQ machinery —
 * those are platform-service concerns (#127) applied by callers through the
 * {@link PinterestDispatcher}.
 *
 * Pinterest authenticates with a Bearer access token and returns an error
 * envelope of `{ code, message }`. The base URL is treated as untrusted config
 * (BYOK) and SSRF-validated at construction; access tokens are never logged.
 */
import { assertSafeUrl } from "../../server/setup/ssrf.js";

/** A `fetch`-shaped transport, injected so tests never hit the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Default Pinterest v5 REST base host. */
export const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5";

/** Pinterest's standard error envelope (subset we rely on). */
export interface PinterestErrorEnvelope {
  code?: number;
  message?: string;
}

/** A typed Pinterest API failure carrying enough to classify + redact. */
export class PinterestApiError extends Error {
  readonly httpStatus: number;
  readonly code?: number;
  readonly transient: boolean;

  constructor(message: string, init: { httpStatus: number; code?: number; transient: boolean }) {
    super(message);
    this.name = "PinterestApiError";
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.transient = init.transient;
  }
}

/** True when an error should be retried by the platform-service retry helper. */
export function isTransientPinterestError(err: unknown): boolean {
  return err instanceof PinterestApiError && err.transient;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface PinterestRequestOptions {
  accessToken: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

export interface PinterestRestClientOptions {
  baseUrl?: string;
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

function toApiError(httpStatus: number, body: PinterestErrorEnvelope): PinterestApiError {
  const transient = httpStatus === 429 || httpStatus >= 500;
  return new PinterestApiError(body.message ?? `Pinterest request failed (HTTP ${httpStatus})`, {
    httpStatus,
    code: body.code,
    transient
  });
}

/** Thin, typed wrapper over `fetch` for the Pinterest v5 REST API. */
export class PinterestRestClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: PinterestRestClientOptions = {}) {
    const base = opts.baseUrl ?? PINTEREST_API_BASE_URL;
    const parsed = assertSafeUrl(base);
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  async get<T>(path: string, opts: PinterestRequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  async post<T>(path: string, opts: PinterestRequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: PinterestRequestOptions
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
    const json = text.length > 0 ? (safeParse(text) as PinterestErrorEnvelope) : {};

    if (!res.ok) {
      throw toApiError(res.status, json);
    }
    return json as T;
  }
}
