/**
 * LinkedIn Posts API publisher (#61).
 *
 * Publishes to the versioned Posts API (`POST /rest/posts`) for either a member
 * or an organization author. The author URN selects the scope:
 *   - member:       `urn:li:person:{id}`   (requires `w_member_social`)
 *   - organization: `urn:li:organization:{id}` (requires `w_organization_social`)
 *
 * The request shape mirrors LinkedIn's versioned Posts contract: `author`,
 * `commentary`, `visibility` (`PUBLIC` | `CONNECTIONS` | `LOGGED_IN`),
 * `distribution`, and `lifecycleState: PUBLISHED`. The published post id is
 * read from the `x-restli-id` / `x-linkedin-id` response header when present,
 * else the body `id`.
 *
 * Every mutating call flows through {@link LinkedInDispatcher} so it shares the
 * LinkedIn rate-limit budget (#141) and retry/DLQ behaviour (#142). The
 * publisher itself owns no retry/limit logic.
 */
import type { LinkedInDispatcher } from "./dispatcher.js";
import type { LinkedInRestClient } from "./rest-client.js";

/** Author of a LinkedIn post: a member or an organization. */
export type LinkedInAuthorKind = "member" | "organization";

/** A LinkedIn publish target: the author urn plus its access token. */
export interface LinkedInAuthor {
  kind: LinkedInAuthorKind;
  /** The bare id (without the `urn:li:...` prefix). */
  id: string;
  accessToken: string;
}

/** LinkedIn post visibility. */
export type LinkedInVisibility = "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";

export interface LinkedInPublishRequest {
  /** Post text. */
  commentary: string;
  /** Visibility. Default `PUBLIC`. */
  visibility?: LinkedInVisibility;
}

export interface LinkedInPublishResult {
  postId: string;
}

export interface LinkedInPublisherDeps {
  client: LinkedInRestClient;
  dispatcher: LinkedInDispatcher;
  /** Rate-limit budget key. Default `"linkedin"`. */
  platform?: string;
}

/** Build the `urn:li:...` author string from a target. */
export function authorUrn(author: LinkedInAuthor): string {
  return author.kind === "organization"
    ? `urn:li:organization:${author.id}`
    : `urn:li:person:${author.id}`;
}

interface PostResponse {
  id?: string;
}

export class LinkedInPublisher {
  private readonly client: LinkedInRestClient;
  private readonly dispatcher: LinkedInDispatcher;
  private readonly platform: string;

  constructor(deps: LinkedInPublisherDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "linkedin";
  }

  /** Publish a post on behalf of a member or organization. */
  async publish(
    author: LinkedInAuthor,
    req: LinkedInPublishRequest
  ): Promise<LinkedInPublishResult> {
    const urn = authorUrn(author);
    const body = {
      author: urn,
      commentary: req.commentary,
      visibility: req.visibility ?? "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: []
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    };

    const created = await this.run<PostResponse>("linkedin.publish", { author: urn }, () =>
      this.client.post<PostResponse>("/posts", {
        accessToken: author.accessToken,
        body
      })
    );
    if (!created.id) {
      throw new Error("linkedin publish returned no post id");
    }
    return { postId: created.id };
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
