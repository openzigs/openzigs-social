/**
 * Facebook Pages connector (#57).
 *
 * Read/write surface for a connected Facebook Page:
 *   - **Page discovery** — `GET /me/accounts` exchanges a user token for the
 *     per-page tokens used by every other call.
 *   - **Publish** — `POST /{page-id}/feed` with `message` / `link`.
 *   - **Comments** — `GET /{object-id}/comments` to read, `POST` to reply.
 *   - **Insights** — `GET /{object-id}/insights?metric=…` for page/post metrics.
 *
 * Mutating calls flow through {@link MetaDispatcher} for the shared Meta
 * rate-limit budget + retry/DLQ; the connector owns no retry/limit logic.
 */
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";

/** A Facebook Page target with its page-scoped access token. */
export interface FbPage {
  pageId: string;
  accessToken: string;
  name?: string;
}

export interface FbPostRequest {
  message?: string;
  /** Optional link to attach. */
  link?: string;
}

export interface FbComment {
  id: string;
  message?: string;
  from?: { id?: string; name?: string };
  createdTime?: string;
}

export interface FbInsightValue {
  name: string;
  period?: string;
  values: Array<{ value: unknown; endTime?: string }>;
}

interface RawPage {
  id?: string;
  name?: string;
  access_token?: string;
}

interface RawComment {
  id?: string;
  message?: string;
  from?: { id?: string; name?: string };
  created_time?: string;
}

interface RawInsight {
  name?: string;
  period?: string;
  values?: Array<{ value?: unknown; end_time?: string }>;
}

interface GraphList<T> {
  data?: T[];
}

export interface FacebookPagesDeps {
  client: MetaGraphClient;
  dispatcher: MetaDispatcher;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
}

export class FacebookPages {
  private readonly client: MetaGraphClient;
  private readonly dispatcher: MetaDispatcher;
  private readonly platform: string;

  constructor(deps: FacebookPagesDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "meta";
  }

  /** List the Pages a user token can manage, with per-page tokens. */
  async listPages(userAccessToken: string): Promise<FbPage[]> {
    const res = await this.client.get<GraphList<RawPage>>("/me/accounts", {
      accessToken: userAccessToken,
      query: { fields: "id,name,access_token" }
    });
    return (res.data ?? [])
      .filter((p): p is RawPage & { id: string; access_token: string } =>
        Boolean(p.id && p.access_token)
      )
      .map((p) => ({
        pageId: p.id,
        accessToken: p.access_token,
        ...(p.name ? { name: p.name } : {})
      }));
  }

  /** Publish a post to a Page's feed. */
  async createPost(page: FbPage, req: FbPostRequest): Promise<{ id: string }> {
    if (!req.message && !req.link) {
      throw new Error("facebook post requires a message or a link");
    }
    const body: Record<string, string> = {};
    if (req.message) body.message = req.message;
    if (req.link) body.link = req.link;
    return this.run<{ id: string }>("facebook.post", { pageId: page.pageId }, () =>
      this.client.post<{ id: string }>(`/${page.pageId}/feed`, {
        accessToken: page.accessToken,
        body
      })
    );
  }

  /** Read comments on a post/object. */
  async listComments(page: FbPage, objectId: string): Promise<FbComment[]> {
    const res = await this.client.get<GraphList<RawComment>>(`/${objectId}/comments`, {
      accessToken: page.accessToken,
      query: { fields: "id,message,from,created_time" }
    });
    return (res.data ?? [])
      .filter((c): c is RawComment & { id: string } => Boolean(c.id))
      .map((c) => ({
        id: c.id,
        ...(c.message !== undefined ? { message: c.message } : {}),
        ...(c.from ? { from: c.from } : {}),
        ...(c.created_time ? { createdTime: c.created_time } : {})
      }));
  }

  /** Reply to a post/comment object. */
  async reply(page: FbPage, objectId: string, message: string): Promise<{ id: string }> {
    return this.run<{ id: string }>("facebook.comment", { objectId }, () =>
      this.client.post<{ id: string }>(`/${objectId}/comments`, {
        accessToken: page.accessToken,
        body: { message }
      })
    );
  }

  /** Read insights metrics for a page or post object. */
  async getInsights(page: FbPage, objectId: string, metrics: string[]): Promise<FbInsightValue[]> {
    if (metrics.length === 0) throw new Error("at least one insights metric is required");
    const res = await this.client.get<GraphList<RawInsight>>(`/${objectId}/insights`, {
      accessToken: page.accessToken,
      query: { metric: metrics.join(",") }
    });
    return (res.data ?? [])
      .filter((m): m is RawInsight & { name: string } => Boolean(m.name))
      .map((m) => ({
        name: m.name,
        ...(m.period ? { period: m.period } : {}),
        values: (m.values ?? []).map((v) => ({
          value: v.value,
          ...(v.end_time ? { endTime: v.end_time } : {})
        }))
      }));
  }

  private async run<T>(opKind: string, payload: unknown, fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind, payload },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
