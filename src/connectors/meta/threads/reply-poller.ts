/**
 * Threads reply poller (#136).
 *
 * One poll pass pulls replies to a Threads media post and persists them into
 * the cross-platform SocialBrain (#143): the post becomes a thread, each
 * replier a contact, each reply an idempotent inbound message keyed on
 * `(platform, platform_message_id)` — so re-polling never duplicates.
 *
 * Reads flow through {@link MetaDispatcher} so polling shares the Meta
 * rate-limit budget; the scheduler drives cadence with injectable timers.
 */
import type { SocialBrainRepository } from "../../../platform/index.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import type { ThreadsAccount } from "./publisher.js";

const PLATFORM = "threads";

interface GraphList<T> {
  data?: T[];
}

interface ThreadsReply {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  from?: { id?: string; username?: string };
}

export interface ThreadsReplyPollerDeps {
  client: MetaGraphClient;
  brain: SocialBrainRepository;
  dispatcher: MetaDispatcher;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
}

export interface ThreadsReplyPollResult {
  replies: number;
}

export class ThreadsReplyPoller {
  private readonly client: MetaGraphClient;
  private readonly brain: SocialBrainRepository;
  private readonly dispatcher: MetaDispatcher;
  private readonly platform: string;

  constructor(deps: ThreadsReplyPollerDeps) {
    this.client = deps.client;
    this.brain = deps.brain;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "meta";
  }

  /** Pull replies for a Threads media id into SocialBrain. */
  async poll(account: ThreadsAccount, mediaId: string): Promise<ThreadsReplyPollResult> {
    const res = await this.run<GraphList<ThreadsReply>>(() =>
      this.client.get<GraphList<ThreadsReply>>(`/${mediaId}/replies`, {
        accessToken: account.accessToken,
        query: { fields: "id,text,username,timestamp,from" }
      })
    );

    const thread = this.brain.upsertThread({
      platform: PLATFORM,
      platformThreadId: `media:${mediaId}`,
      subject: "replies"
    });

    let count = 0;
    for (const reply of res.data ?? []) {
      if (!reply.id || this.brain.getMessageByPlatformId(PLATFORM, reply.id)) continue;
      const contact = this.brain.upsertContact({
        platform: PLATFORM,
        platformContactId: reply.from?.id ?? reply.username ?? reply.id,
        handle: reply.username ?? reply.from?.username
      });
      this.brain.upsertMessage({
        platform: PLATFORM,
        platformMessageId: reply.id,
        threadId: thread.id,
        contactId: contact.id,
        direction: "inbound",
        body: reply.text ?? "",
        ...(reply.timestamp ? { sentAt: reply.timestamp } : {})
      });
      count += 1;
    }
    return { replies: count };
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind: "threads.poll.replies", payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
