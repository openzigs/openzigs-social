/**
 * Threads content publisher (#135).
 *
 * Threads uses its own Graph host (`graph.threads.net`) but mirrors the
 * Instagram two-step publish flow:
 *
 *   1. **Create a container** — `POST /{threads-user-id}/threads` with
 *      `media_type=TEXT|IMAGE|VIDEO`, `text`, and `image_url`/`video_url`.
 *   2. **Wait for processing** — IMAGE/VIDEO containers are processed
 *      asynchronously; poll `GET /{container-id}?fields=status` until `FINISHED`
 *      (injectable `sleep` so fake timers drive tests). TEXT is immediate.
 *   3. **Publish** — `POST /{threads-user-id}/threads_publish` with `creation_id`.
 *
 * All mutating calls flow through {@link MetaDispatcher} for the shared Meta
 * rate-limit budget + retry/DLQ.
 */
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";

/** A Threads account target: the Threads user id + its access token. */
export interface ThreadsAccount {
  threadsUserId: string;
  accessToken: string;
}

export interface ThreadsTextPost {
  kind: "text";
  text: string;
}

export interface ThreadsImagePost {
  kind: "image";
  imageUrl: string;
  text?: string;
}

export interface ThreadsVideoPost {
  kind: "video";
  videoUrl: string;
  text?: string;
}

export type ThreadsPublishRequest = ThreadsTextPost | ThreadsImagePost | ThreadsVideoPost;

export interface ThreadsPublishResult {
  mediaId: string;
}

export interface ThreadsPublisherDeps {
  client: MetaGraphClient;
  dispatcher: MetaDispatcher;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
  /** Injectable delay between status polls (fake timers in tests). */
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

interface ContainerStatus {
  status?: "ERROR" | "EXPIRED" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;

export class ThreadsContainerNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadsContainerNotReadyError";
  }
}

export class ThreadsPublisher {
  private readonly client: MetaGraphClient;
  private readonly dispatcher: MetaDispatcher;
  private readonly platform: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(deps: ThreadsPublisherDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "meta";
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxPollAttempts = deps.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  }

  async publish(
    account: ThreadsAccount,
    req: ThreadsPublishRequest
  ): Promise<ThreadsPublishResult> {
    const body: Record<string, string> = {};
    if (req.kind === "text") {
      body.media_type = "TEXT";
      body.text = req.text;
    } else if (req.kind === "image") {
      body.media_type = "IMAGE";
      body.image_url = req.imageUrl;
      if (req.text) body.text = req.text;
    } else {
      body.media_type = "VIDEO";
      body.video_url = req.videoUrl;
      if (req.text) body.text = req.text;
    }

    const created = await this.run<{ id: string }>("threads.container", { kind: req.kind }, () =>
      this.client.post<{ id: string }>(`/${account.threadsUserId}/threads`, {
        accessToken: account.accessToken,
        body
      })
    );

    if (req.kind !== "text") {
      await this.waitForContainer(account, created.id);
    }

    const published = await this.run<{ id: string }>(
      "threads.publish",
      { creationId: created.id },
      () =>
        this.client.post<{ id: string }>(`/${account.threadsUserId}/threads_publish`, {
          accessToken: account.accessToken,
          body: { creation_id: created.id }
        })
    );
    return { mediaId: published.id };
  }

  private async waitForContainer(account: ThreadsAccount, containerId: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const status = await this.client.get<ContainerStatus>(`/${containerId}`, {
        accessToken: account.accessToken,
        query: { fields: "status" }
      });
      const code = status.status;
      if (code === "FINISHED" || code === "PUBLISHED") return;
      if (code === "ERROR" || code === "EXPIRED") {
        throw new ThreadsContainerNotReadyError(`container ${containerId} status=${code}`);
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new ThreadsContainerNotReadyError(
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
