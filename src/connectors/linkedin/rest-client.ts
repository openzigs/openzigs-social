/**
 * LinkedIn versioned REST API client (#61).
 *
 * The single, typed, injectable HTTP client shared by every LinkedIn surface in
 * Cohort B — the Posts publisher (#61), the comment poller (#61), and the
 * analytics poller (#62). Like the Meta `graph-client.ts` it owns NO retry,
 * rate-limit, or DLQ machinery: those are platform-service concerns (#127)
 * applied by callers through {@link LinkedInDispatcher}. The client's jobs are:
 *
 *   1. Build a request against the configured versioned REST base URL,
 *      attaching the `LinkedIn-Version` (`yyyymm`) and `X-Restli-Protocol-Version`
 *      headers every versioned endpoint requires.
 *   2. Carry the member/organization access token as a Bearer header — never in
 *      a log line and never in the query string.
 *   3. Parse LinkedIn's error envelope (`{ message, serviceErrorCode, status }`)
 *      into a typed {@link LinkedInApiError} that flags whether the failure is
 *      *transient* (so callers retry only those).
 *
 * Security (OWASP SSRF): the base URL is treated as untrusted config (BYOK) and
 * validated through the shared {@link assertSafeUrl} guard at construction, so a
 * mis-configured `restBaseUrl` can never point the server at a private/loopback
 * address. Access tokens are never logged and never echoed.
 */
import { assertSafeUrl } from "../../server/setup/ssrf.js";

/** A `fetch`-shaped transport, injected so tests never hit the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Default LinkedIn versioned API version (`yyyymm`) this connector targets. */
export const LINKEDIN_API_VERSION = "202401";
/** Default LinkedIn versioned REST base host. */
export const LINKEDIN_REST_BASE_URL = "https://api.linkedin.com/rest";

/** LinkedIn's standard error envelope (subset we rely on). */
export interface LinkedInErrorEnvelope {
  message?: string;
  serviceErrorCode?: number;
  status?: number;
  code?: string;
}

/** A typed LinkedIn API failure carrying enough to classify + redact. */
export class LinkedInApiError extends Error {
  readonly httpStatus: number;
  readonly serviceErrorCode?: number;
  readonly code?: string;
  readonly transient: boolean;

  constructor(
    message: string,
    init: {
      httpStatus: number;
      serviceErrorCode?: number;
      code?: string;
      transient: boolean;
    }
  ) {
    super(message);
    this.name = "LinkedInApiError";
    this.httpStatus = init.httpStatus;
    this.serviceErrorCode = init.serviceErrorCode;
    this.code = init.code;
    this.transient = init.transient;
  }
}

/** True when an error should be retried by the platform-service retry helper. */
export function isTransientLinkedInError(err: unknown): boolean {
  return err instanceof LinkedInApiError && err.transient;
}

/** Primitive query values accepted by the client. */
export type QueryValue = string | number | boolean | undefined | null;

export interface LinkedInRequestOptions {
  /** Member/organization access token for the call (kept out of logs). */
  accessToken: string;
  /** Query-string parameters. */
  query?: Record<string, QueryValue>;
  /** JSON request body (POST only). */
  body?: unknown;
}

export interface LinkedInRestClientOptions {
  /** REST base URL incl. no version path, e.g. `https://api.linkedin.com/rest`. */
  baseUrl?: string;
  /** Versioned API header value (`yyyymm`). */
  apiVersion?: string;
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

function toApiError(httpStatus: number, body: LinkedInErrorEnvelope): LinkedInApiError {
  const transient = httpStatus === 429 || httpStatus >= 500;
  return new LinkedInApiError(body.message ?? `LinkedIn request failed (HTTP ${httpStatus})`, {
    httpStatus,
    serviceErrorCode: body.serviceErrorCode,
    code: body.code,
    transient
  });
}

/** Thin, typed wrapper over `fetch` for the LinkedIn versioned REST API. */
export class LinkedInRestClient {
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: LinkedInRestClientOptions = {}) {
    const base = opts.baseUrl ?? LINKEDIN_REST_BASE_URL;
    // SSRF guard: refuse a base URL that resolves to loopback/private space.
    const parsed = assertSafeUrl(base);
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.apiVersion = opts.apiVersion ?? LINKEDIN_API_VERSION;
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  }

  /** Perform a GET against `path` (e.g. `/socialActions/{urn}/comments`). */
  async get<T>(path: string, opts: LinkedInRequestOptions): Promise<T> {
    return this.request<T>("GET", path, opts);
  }

  /** Perform a POST against `path` with a JSON body. */
  async post<T>(path: string, opts: LinkedInRequestOptions): Promise<T> {
    return this.request<T>("POST", path, opts);
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts: LinkedInRequestOptions
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    appendQuery(url, opts.query ?? {});

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${opts.accessToken}`,
      "LinkedIn-Version": this.apiVersion,
      "X-Restli-Protocol-Version": "2.0.0"
    };
    const init: RequestInit = { method, headers };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body ?? {});
    }

    const res = await this.fetchImpl(url.toString(), init);
    const text = await res.text();
    const json = text.length > 0 ? (safeParse(text) as LinkedInErrorEnvelope) : {};

    if (!res.ok) {
      throw toApiError(res.status, json);
    }
    return json as T;
  }
}
