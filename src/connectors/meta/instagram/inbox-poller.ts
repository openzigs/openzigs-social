/**
 * Instagram inbox poller (#55).
 *
 * One poll pass pulls recent Messenger conversations for a connected IG
 * business account and persists them into the cross-platform SocialBrain
 * (#143): each conversation becomes a thread, each participant a contact, and
 * each message an idempotent row keyed on `(platform, platform_message_id)` —
 * so re-polling never duplicates. Comment ingestion for a given media id is a
 * separate method callers invoke per published post.
 *
 * Every Graph read flows through {@link MetaDispatcher} so polling shares the
 * Meta rate-limit budget; the scheduler (see `scheduler.ts`) drives the cadence
 * with injectable timers so tests stay deterministic.
 */
import type { SocialBrainRepository } from "../../../platform/index.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import type { IgAccount } from "./publisher.js";

const PLATFORM = "instagram";

interface GraphList<T> {
  data?: T[];
}

interface IgParticipant {
  id?: string;
  username?: string;
}

interface IgMessage {
  id?: string;
  message?: string;
  created_time?: string;
  from?: IgParticipant;
  to?: GraphList<IgParticipant>;
}

interface IgConversation {
  id?: string;
  messages?: GraphList<IgMessage>;
}

interface IgComment {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  from?: IgParticipant;
}

export interface InstagramInboxPollerDeps {
  client: MetaGraphClient;
  brain: SocialBrainRepository;
  dispatcher: MetaDispatcher;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
  /** Max conversations fetched per poll. Default 25. */
  conversationLimit?: number;
}

export interface PollResult {
  conversations: number;
  messages: number;
}

export class InstagramInboxPoller {
  private readonly client: MetaGraphClient;
  private readonly brain: SocialBrainRepository;
  private readonly dispatcher: MetaDispatcher;
  private readonly platform: string;
  private readonly conversationLimit: number;

  constructor(deps: InstagramInboxPollerDeps) {
    this.client = deps.client;
    this.brain = deps.brain;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "meta";
    this.conversationLimit = deps.conversationLimit ?? 25;
  }

  /** Pull recent DM conversations into SocialBrain. */
  async poll(account: IgAccount): Promise<PollResult> {
    const convos = await this.run<GraphList<IgConversation>>("instagram.poll.conversations", () =>
      this.client.get<GraphList<IgConversation>>(`/${account.igUserId}/conversations`, {
        accessToken: account.accessToken,
        query: {
          platform: PLATFORM,
          fields: `messages{id,message,created_time,from,to}`,
          limit: this.conversationLimit
        }
      })
    );

    let messageCount = 0;
    for (const convo of convos.data ?? []) {
      if (!convo.id) continue;
      const thread = this.brain.upsertThread({
        platform: PLATFORM,
        platformThreadId: convo.id
      });
      for (const msg of convo.messages?.data ?? []) {
        if (this.persistMessage(account, thread.id, msg)) messageCount += 1;
      }
    }
    return { conversations: convos.data?.length ?? 0, messages: messageCount };
  }

  /** Pull comments for a published media id into SocialBrain as inbound msgs. */
  async pollComments(account: IgAccount, mediaId: string): Promise<{ comments: number }> {
    const comments = await this.run<GraphList<IgComment>>("instagram.poll.comments", () =>
      this.client.get<GraphList<IgComment>>(`/${mediaId}/comments`, {
        accessToken: account.accessToken,
        query: { fields: "id,text,username,timestamp,from" }
      })
    );

    const thread = this.brain.upsertThread({
      platform: PLATFORM,
      platformThreadId: `media:${mediaId}`,
      subject: "comments"
    });

    let count = 0;
    for (const comment of comments.data ?? []) {
      if (!comment.id || this.brain.getMessageByPlatformId(PLATFORM, comment.id)) continue;
      const contact = this.brain.upsertContact({
        platform: PLATFORM,
        platformContactId: comment.from?.id ?? comment.username ?? comment.id,
        handle: comment.username ?? comment.from?.username
      });
      this.brain.upsertMessage({
        platform: PLATFORM,
        platformMessageId: comment.id,
        threadId: thread.id,
        contactId: contact.id,
        direction: "inbound",
        body: comment.text ?? "",
        ...(comment.timestamp ? { sentAt: comment.timestamp } : {})
      });
      count += 1;
    }
    return { comments: count };
  }

  private persistMessage(account: IgAccount, threadId: number, msg: IgMessage): boolean {
    if (!msg.id || this.brain.getMessageByPlatformId(PLATFORM, msg.id)) return false;

    const isOutbound = msg.from?.id === account.igUserId;
    const other = isOutbound ? msg.to?.data?.[0] : msg.from;
    const contact = this.brain.upsertContact({
      platform: PLATFORM,
      platformContactId: other?.id ?? msg.id,
      handle: other?.username
    });
    this.brain.upsertMessage({
      platform: PLATFORM,
      platformMessageId: msg.id,
      threadId,
      contactId: contact.id,
      direction: isOutbound ? "outbound" : "inbound",
      body: msg.message ?? "",
      ...(msg.created_time ? { sentAt: msg.created_time } : {})
    });
    return true;
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
