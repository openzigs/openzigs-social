/**
 * LinkedIn comment poller (#61).
 *
 * LinkedIn does not expose realtime comment webhooks without the gated
 * Compliance Partner Program, so inbound comment activity uses the **polling
 * fallback** pattern (mirroring the Meta `scheduler.ts` + reply-poller design).
 *
 * One poll pass reads comments on a post via
 * `GET /rest/socialActions/{postUrn}/comments` and persists each into the
 * cross-platform SocialBrain (#143): the post becomes a thread, each commenter
 * a contact, each comment an idempotent inbound message keyed on
 * `(platform, platform_message_id)` — so re-polling never duplicates.
 *
 * Reads flow through {@link LinkedInDispatcher} so polling shares the LinkedIn
 * rate-limit budget; the scheduler drives cadence with injectable timers.
 */
import type { SocialBrainRepository } from "../../platform/index.js";
import type { LinkedInDispatcher } from "./dispatcher.js";
import type { LinkedInRestClient } from "./rest-client.js";

const PLATFORM = "linkedin";

interface CommentList<T> {
  elements?: T[];
}

interface LinkedInComment {
  /** Comment URN, e.g. `urn:li:comment:(...)`. */
  $URN?: string;
  id?: string;
  actor?: string;
  message?: { text?: string };
  created?: { time?: number };
}

export interface LinkedInCommentPollerDeps {
  client: LinkedInRestClient;
  brain: SocialBrainRepository;
  dispatcher: LinkedInDispatcher;
  /** Rate-limit budget key. Default `"linkedin"`. */
  platform?: string;
}

export interface LinkedInCommentPollResult {
  comments: number;
}

export class LinkedInCommentPoller {
  private readonly client: LinkedInRestClient;
  private readonly brain: SocialBrainRepository;
  private readonly dispatcher: LinkedInDispatcher;
  private readonly platform: string;

  constructor(deps: LinkedInCommentPollerDeps) {
    this.client = deps.client;
    this.brain = deps.brain;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "linkedin";
  }

  /** Pull comments for a post URN into SocialBrain. */
  async poll(accessToken: string, postUrn: string): Promise<LinkedInCommentPollResult> {
    const encoded = encodeURIComponent(postUrn);
    const res = await this.run<CommentList<LinkedInComment>>(() =>
      this.client.get<CommentList<LinkedInComment>>(`/socialActions/${encoded}/comments`, {
        accessToken
      })
    );

    const thread = this.brain.upsertThread({
      platform: PLATFORM,
      platformThreadId: postUrn,
      subject: "comments"
    });

    let count = 0;
    for (const comment of res.elements ?? []) {
      const messageId = comment.$URN ?? comment.id;
      if (!messageId || this.brain.getMessageByPlatformId(PLATFORM, messageId)) continue;
      const contact = this.brain.upsertContact({
        platform: PLATFORM,
        platformContactId: comment.actor ?? messageId
      });
      this.brain.upsertMessage({
        platform: PLATFORM,
        platformMessageId: messageId,
        threadId: thread.id,
        contactId: contact.id,
        direction: "inbound",
        body: comment.message?.text ?? "",
        ...(typeof comment.created?.time === "number"
          ? { sentAt: new Date(comment.created.time).toISOString() }
          : {})
      });
      count += 1;
    }
    return { comments: count };
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind: "linkedin.poll.comments", payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
