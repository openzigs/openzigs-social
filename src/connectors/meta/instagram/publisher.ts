/**
 * Instagram content publisher (#56).
 *
 * Implements Meta's two-step Graph publishing flow for an IG Business/Creator
 * account:
 *
 *   1. **Create a media container** — `POST /{ig-user-id}/media`. Shape varies:
 *        - image:    `image_url`, `caption`
 *        - video/reel: `media_type=VIDEO|REELS`, `video_url`, `caption`,
 *          optional `thumb_offset`
 *        - carousel: one child container per item (`is_carousel_item=true`),
 *          then a parent `media_type=CAROUSEL` with `children=<csv>`
 *   2. **Wait for processing** — video/reel/carousel containers are processed
 *      asynchronously; poll `GET /{container-id}?fields=status_code` until it
 *      reports `FINISHED` (injectable `sleep`, so fake timers drive tests).
 *   3. **Publish** — `POST /{ig-user-id}/media_publish` with `creation_id`.
 *
 * Every mutating Graph call flows through {@link MetaDispatcher} so it shares
 * the Meta rate-limit budget (#141) and retry/DLQ behaviour (#142). The
 * publisher itself owns no retry/limit logic.
 */
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";

/** An IG account target: the IG user id plus its (long-lived) access token. */
export interface IgAccount {
  igUserId: string;
  accessToken: string;
}

export interface IgImagePost {
  kind: "image";
  imageUrl: string;
  caption?: string;
}

export interface IgVideoPost {
  kind: "video" | "reel";
  videoUrl: string;
  caption?: string;
  /** Cover-frame offset in ms. */
  thumbOffset?: number;
}

export interface IgCarouselChild {
  imageUrl?: string;
  videoUrl?: string;
}

export interface IgCarouselPost {
  kind: "carousel";
  children: IgCarouselChild[];
  caption?: string;
}

export type IgPublishRequest = IgImagePost | IgVideoPost | IgCarouselPost;

export interface IgPublishResult {
  mediaId: string;
}

export interface InstagramPublisherDeps {
  client: MetaGraphClient;
  dispatcher: MetaDispatcher;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
  /** Injectable delay between status polls (fake timers in tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Delay between container status polls. Default 2000ms. */
  pollIntervalMs?: number;
  /** Max status polls before giving up. Default 30. */
  maxPollAttempts?: number;
}

interface ContainerStatus {
  status_code?: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;

/** Thrown when a container fails to process or never reaches FINISHED. */
export class IgContainerNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IgContainerNotReadyError";
  }
}

export class InstagramPublisher {
  private readonly client: MetaGraphClient;
  private readonly dispatcher: MetaDispatcher;
  private readonly platform: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(deps: InstagramPublisherDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "meta";
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = deps.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  }

  /** Publish a post, returning the published media id. Throws on failure. */
  async publish(account: IgAccount, req: IgPublishRequest): Promise<IgPublishResult> {
    const creationId =
      req.kind === "carousel"
        ? await this.createCarousel(account, req)
        : await this.createSingle(account, req);

    // Single images are ready immediately; video/reel/carousel need processing.
    if (req.kind !== "image") {
      await this.waitForContainer(account, creationId);
    }

    const published = await this.run<{ id: string }>("instagram.publish", { creationId }, () =>
      this.client.post<{ id: string }>(`/${account.igUserId}/media_publish`, {
        accessToken: account.accessToken,
        body: { creation_id: creationId }
      })
    );
    return { mediaId: published.id };
  }

  private async createSingle(account: IgAccount, req: IgImagePost | IgVideoPost): Promise<string> {
    const body: Record<string, string | number> = {};
    if (req.caption) body.caption = req.caption;
    if (req.kind === "image") {
      body.image_url = req.imageUrl;
    } else {
      body.media_type = req.kind === "reel" ? "REELS" : "VIDEO";
      body.video_url = req.videoUrl;
      if (typeof req.thumbOffset === "number") body.thumb_offset = req.thumbOffset;
    }
    const created = await this.run<{ id: string }>("instagram.container", { kind: req.kind }, () =>
      this.client.post<{ id: string }>(`/${account.igUserId}/media`, {
        accessToken: account.accessToken,
        body
      })
    );
    return created.id;
  }

  private async createCarousel(account: IgAccount, req: IgCarouselPost): Promise<string> {
    if (req.children.length < 2 || req.children.length > 10) {
      throw new Error("instagram carousel requires between 2 and 10 children");
    }
    const childIds: string[] = [];
    for (const child of req.children) {
      const body: Record<string, string> = { is_carousel_item: "true" };
      if (child.videoUrl) {
        body.media_type = "VIDEO";
        body.video_url = child.videoUrl;
      } else if (child.imageUrl) {
        body.image_url = child.imageUrl;
      } else {
        throw new Error("carousel child requires imageUrl or videoUrl");
      }
      const created = await this.run<{ id: string }>(
        "instagram.container",
        { carouselChild: true },
        () =>
          this.client.post<{ id: string }>(`/${account.igUserId}/media`, {
            accessToken: account.accessToken,
            body
          })
      );
      childIds.push(created.id);
    }

    const parentBody: Record<string, string> = {
      media_type: "CAROUSEL",
      children: childIds.join(",")
    };
    if (req.caption) parentBody.caption = req.caption;
    const parent = await this.run<{ id: string }>("instagram.container", { carousel: true }, () =>
      this.client.post<{ id: string }>(`/${account.igUserId}/media`, {
        accessToken: account.accessToken,
        body: parentBody
      })
    );
    return parent.id;
  }

  private async waitForContainer(account: IgAccount, containerId: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const status = await this.client.get<ContainerStatus>(`/${containerId}`, {
        accessToken: account.accessToken,
        query: { fields: "status_code" }
      });
      const code = status.status_code;
      if (code === "FINISHED" || code === "PUBLISHED") return;
      if (code === "ERROR" || code === "EXPIRED") {
        throw new IgContainerNotReadyError(`container ${containerId} status=${code}`);
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new IgContainerNotReadyError(
      `container ${containerId} not ready after ${this.maxPollAttempts} polls`
    );
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
