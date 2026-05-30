/**
 * X (Twitter) tweet publisher — Cohort C (#66, sub #68).
 *
 * Publishes original tweets and replies via the X v2 `POST /tweets` endpoint:
 *   - tweet: `{ text }`
 *   - reply: `{ text, reply: { in_reply_to_tweet_id } }`
 * The created tweet id is read from the `data.id` response field.
 *
 * Every mutating call flows through {@link TwitterDispatcher} so it shares the
 * X rate-limit budget (#141) and retry/DLQ behaviour (#142). Before each write
 * the optional {@link TwitterQuotaGuard} enforces the monthly tier write cap
 * (#69/#70): it throws when the cap is reached (blocking the call) and records
 * the consumed credit on success. The publisher itself owns no retry/limit
 * logic.
 */
import type { TwitterDispatcher } from "./dispatcher.js";
import type { TwitterQuotaGuard } from "./quota-guard.js";
import type { TwitterRestClient } from "./rest-client.js";

export interface TwitterPublishRequest {
  /** Tweet text. */
  text: string;
}

export interface TwitterReplyRequest {
  /** Reply text. */
  text: string;
  /** The tweet id being replied to. */
  inReplyToTweetId: string;
}

export interface TwitterPublishResult {
  tweetId: string;
}

export interface TwitterPublisherDeps {
  client: TwitterRestClient;
  dispatcher: TwitterDispatcher;
  /** Monthly write-quota guard (#70). Optional but wired in production. */
  quota?: TwitterQuotaGuard;
  /** Rate-limit budget key. Default `"twitter"`. */
  platform?: string;
}

interface CreateTweetResponse {
  data?: { id?: string; text?: string };
}

export class TwitterPublisher {
  private readonly client: TwitterRestClient;
  private readonly dispatcher: TwitterDispatcher;
  private readonly quota?: TwitterQuotaGuard;
  private readonly platform: string;

  constructor(deps: TwitterPublisherDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    if (deps.quota) this.quota = deps.quota;
    this.platform = deps.platform ?? "twitter";
  }

  /** Publish an original tweet. */
  async publish(accessToken: string, req: TwitterPublishRequest): Promise<TwitterPublishResult> {
    return this.createTweet("tweet", "twitter.publish", accessToken, { text: req.text });
  }

  /** Publish a reply to an existing tweet. */
  async reply(accessToken: string, req: TwitterReplyRequest): Promise<TwitterPublishResult> {
    return this.createTweet("reply", "twitter.reply", accessToken, {
      text: req.text,
      reply: { in_reply_to_tweet_id: req.inReplyToTweetId }
    });
  }

  private async createTweet(
    kind: "tweet" | "reply",
    opKind: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<TwitterPublishResult> {
    // Block before spending a real attempt if the monthly cap is reached.
    this.quota?.ensureWithinQuota();

    const created = await this.run<CreateTweetResponse>(opKind, () =>
      this.client.post<CreateTweetResponse>("/tweets", { accessToken, body })
    );
    const tweetId = created.data?.id;
    if (!tweetId) {
      throw new Error("x publish returned no tweet id");
    }
    this.quota?.recordWrite({ kind, dedupeKey: `${kind}:${tweetId}` });
    return { tweetId };
  }

  private async run<T>(opKind: string, fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind, payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
