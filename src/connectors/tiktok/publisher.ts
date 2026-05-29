/**
 * TikTok video publisher (#64) with hard PRIVATE-only enforcement (#65).
 *
 * Initiates a video post via `POST /post/publish/video/init/` using the
 * PULL_FROM_URL source (TikTok fetches the hosted video). Every mutating call
 * flows through {@link TikTokDispatcher} so it shares the TikTok rate-limit
 * budget (#141) and retry/DLQ behaviour (#142).
 *
 * ## PRIVATE-only constraint (#65 — hard requirement)
 * Until the app passes TikTok's content-posting audit, the Unaudited Client
 * restriction means published posts MUST be private. This publisher therefore
 * **forces** `privacy_level: "SELF_ONLY"` on every request and {@link
 * assertPrivateOnly} fails closed if a caller ever tries to request a public or
 * mutual-follow visibility. The public privacy levels are never sent.
 */
import type { TikTokDispatcher } from "./dispatcher.js";
import type { TikTokRestClient } from "./rest-client.js";

/** The single permitted privacy level for an Unaudited TikTok client. */
export const TIKTOK_PRIVATE_PRIVACY_LEVEL = "SELF_ONLY" as const;

/** Privacy levels TikTok exposes once audited — all forbidden in v1. */
export const TIKTOK_FORBIDDEN_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR"
] as const;

/** Thrown when a caller requests a non-private privacy level. */
export class TikTokPrivacyError extends Error {
  constructor(level: string) {
    super(
      `TikTok privacy level "${level}" is not allowed: unaudited clients may only post privately (${TIKTOK_PRIVATE_PRIVACY_LEVEL})`
    );
    this.name = "TikTokPrivacyError";
  }
}

/**
 * Fail closed unless the requested privacy level is exactly `SELF_ONLY`. Any
 * other value (including a typo) is rejected so a public post can never be
 * issued by an unaudited client.
 */
export function assertPrivateOnly(level: string | undefined): void {
  if (level !== undefined && level !== TIKTOK_PRIVATE_PRIVACY_LEVEL) {
    throw new TikTokPrivacyError(level);
  }
}

export interface TikTokPublishVideoRequest {
  /** Publicly reachable video URL TikTok will pull. */
  videoUrl: string;
  title?: string;
  /**
   * Optional explicit privacy level. If provided it MUST be `SELF_ONLY`;
   * anything else throws. When omitted the publisher defaults to `SELF_ONLY`.
   */
  privacyLevel?: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

export interface TikTokPublishResult {
  publishId: string;
}

export interface TikTokPublisherDeps {
  client: TikTokRestClient;
  dispatcher: TikTokDispatcher;
  /** Rate-limit budget key. Default `"tiktok"`. */
  platform?: string;
}

interface InitResponse {
  publish_id?: string;
}

export class TikTokPublisher {
  private readonly client: TikTokRestClient;
  private readonly dispatcher: TikTokDispatcher;
  private readonly platform: string;

  constructor(deps: TikTokPublisherDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "tiktok";
  }

  /** Initiate a PRIVATE video post (SELF_ONLY is forced). */
  async publishVideo(
    accessToken: string,
    req: TikTokPublishVideoRequest
  ): Promise<TikTokPublishResult> {
    // Fail closed on any non-private request before touching the network.
    assertPrivateOnly(req.privacyLevel);

    const body = {
      post_info: {
        title: req.title ?? "",
        // Forced — never derived from caller input.
        privacy_level: TIKTOK_PRIVATE_PRIVACY_LEVEL,
        disable_comment: req.disableComment ?? false,
        disable_duet: req.disableDuet ?? false,
        disable_stitch: req.disableStitch ?? false
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: req.videoUrl
      }
    };

    const created = await this.run<InitResponse>("tiktok.publish", { url: req.videoUrl }, () =>
      this.client.post<InitResponse>("/post/publish/video/init/", { accessToken, body })
    );
    if (!created.publish_id) throw new Error("tiktok publishVideo returned no publish_id");
    return { publishId: created.publish_id };
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
