/**
 * X (Twitter) direct messages — Cohort C (#66, sub #68).
 *
 * Two surfaces, both **gated behind a paid, DM-enabled tier** (epic #66 hard
 * constraint — see {@link isDmEnabledForTier}; Free never gets DM):
 *
 *   - {@link TwitterDmSender} implements the platform-service
 *     {@link SocialDmSender} port (#51/#144) so the Telegram remote-control
 *     relay can deliver a DM "as the user" on X via
 *     `POST /dm_conversations/with/:participant_id/messages`. When DM is
 *     disabled it `supports()` nothing and `sendDm()` throws
 *     {@link TwitterDmDisabledError} (fail closed). A sent DM consumes a write
 *     credit through the optional {@link TwitterQuotaGuard}.
 *   - {@link TwitterDmPoller} pulls inbound DM events (`GET /dm_events`) into
 *     the cross-platform SocialBrain (#143), idempotent on the DM event id.
 *
 * Both flow through {@link TwitterDispatcher} for the shared X DM rate-limit
 * budget (15 req/15 min, 1440/24 hr) + retry/DLQ behaviour.
 */
import type {
  SocialDmRequest,
  SocialDmResult,
  SocialDmSender
} from "../../channels/social/dm-sender.js";
import type { SocialBrainRepository } from "../../platform/index.js";
import type { TwitterDispatcher } from "./dispatcher.js";
import type { TwitterQuotaGuard } from "./quota-guard.js";
import type { TwitterRestClient } from "./rest-client.js";

const PLATFORM = "twitter";
/** Platform keys the DM sender answers to (the Telegram relay may use either). */
const DM_PLATFORM_KEYS = new Set([PLATFORM, "x"]);
/** Rate-limit budget key for DM (separate from the general write budget). */
const DEFAULT_DM_BUDGET_KEY = "twitter-dm";

/** Thrown when a DM is attempted while DM is disabled (Free tier / opt-out). */
export class TwitterDmDisabledError extends Error {
  constructor() {
    super("x direct messages are disabled (requires a paid, DM-enabled tier)");
    this.name = "TwitterDmDisabledError";
  }
}

/** Resolves the connected X account that sends a DM. */
export interface TwitterDmAccount {
  accessToken: string;
}

export interface TwitterDmSenderDeps {
  client: TwitterRestClient;
  dispatcher: TwitterDispatcher;
  /** Whether DM is enabled for the active tier + user opt-in. */
  enabled: boolean;
  /** Resolves the sending account's access token. */
  getAccount: () => Promise<TwitterDmAccount | undefined>;
  /** Monthly write-quota guard (#70). Optional. */
  quota?: TwitterQuotaGuard;
  /** Rate-limit budget key. Default `"twitter-dm"`. */
  platform?: string;
  /** Injectable clock for the delivery timestamp. */
  now?: () => number;
}

interface SendDmResponse {
  data?: { dm_event_id?: string; dm_conversation_id?: string };
}

export class TwitterDmSender implements SocialDmSender {
  private readonly client: TwitterRestClient;
  private readonly dispatcher: TwitterDispatcher;
  private readonly enabled: boolean;
  private readonly getAccount: () => Promise<TwitterDmAccount | undefined>;
  private readonly quota?: TwitterQuotaGuard;
  private readonly platform: string;
  private readonly now: () => number;

  constructor(deps: TwitterDmSenderDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.enabled = deps.enabled;
    this.getAccount = deps.getAccount;
    if (deps.quota) this.quota = deps.quota;
    this.platform = deps.platform ?? DEFAULT_DM_BUDGET_KEY;
    this.now = deps.now ?? Date.now;
  }

  /** Only routes when DM is enabled AND the platform key matches X. */
  supports(platform: string): boolean {
    return this.enabled && DM_PLATFORM_KEYS.has(platform.toLowerCase());
  }

  async sendDm(request: SocialDmRequest): Promise<SocialDmResult> {
    if (!this.enabled) {
      throw new TwitterDmDisabledError();
    }
    const account = await this.getAccount();
    if (!account) {
      throw new Error("no connected X account to send DM from");
    }
    // Block before spending a real attempt if the monthly cap is reached.
    this.quota?.ensureWithinQuota();

    const outcome = await this.dispatcher.dispatch<SendDmResponse>(
      {
        platform: this.platform,
        opKind: "twitter.dm.send",
        payload: { to: request.recipientId }
      },
      () =>
        this.client.post<SendDmResponse>(
          `/dm_conversations/with/${encodeURIComponent(request.recipientId)}/messages`,
          { accessToken: account.accessToken, body: { text: request.text } }
        )
    );
    if (!outcome.ok) throw outcome.error;

    const messageId = outcome.value.data?.dm_event_id;
    if (messageId) {
      this.quota?.recordWrite({ kind: "dm", dedupeKey: `dm:${messageId}` });
    }
    return {
      platform: PLATFORM,
      recipientId: request.recipientId,
      ...(messageId ? { messageId } : {}),
      deliveredAt: this.now()
    };
  }
}

interface DmEvent {
  id?: string;
  event_type?: string;
  text?: string;
  sender_id?: string;
  dm_conversation_id?: string;
  created_at?: string;
}

interface DmEventsResponse {
  data?: DmEvent[];
}

export interface TwitterDmPollerDeps {
  client: TwitterRestClient;
  brain: SocialBrainRepository;
  dispatcher: TwitterDispatcher;
  /** Whether DM ingest is enabled for the active tier + user opt-in. */
  enabled: boolean;
  /** Rate-limit budget key. Default `"twitter-dm"`. */
  platform?: string;
}

export interface TwitterDmPollResult {
  messages: number;
}

export class TwitterDmPoller {
  private readonly client: TwitterRestClient;
  private readonly brain: SocialBrainRepository;
  private readonly dispatcher: TwitterDispatcher;
  private readonly enabled: boolean;
  private readonly platform: string;

  constructor(deps: TwitterDmPollerDeps) {
    this.client = deps.client;
    this.brain = deps.brain;
    this.dispatcher = deps.dispatcher;
    this.enabled = deps.enabled;
    this.platform = deps.platform ?? DEFAULT_DM_BUDGET_KEY;
  }

  /** Pull inbound DM events into SocialBrain. No-op when DM is disabled. */
  async poll(accessToken: string): Promise<TwitterDmPollResult> {
    if (!this.enabled) return { messages: 0 };

    const res = await this.run<DmEventsResponse>(() =>
      this.client.get<DmEventsResponse>("/dm_events", {
        accessToken,
        query: { "dm_event.fields": "id,text,sender_id,dm_conversation_id,created_at,event_type" }
      })
    );

    let count = 0;
    for (const event of res.data ?? []) {
      const messageId = event.id;
      if (!messageId || this.brain.getMessageByPlatformId(PLATFORM, messageId)) continue;
      if (event.event_type && event.event_type !== "MessageCreate") continue;

      const conversationId = event.dm_conversation_id ?? messageId;
      const contact = this.brain.upsertContact({
        platform: PLATFORM,
        platformContactId: event.sender_id ?? conversationId
      });
      const thread = this.brain.upsertThread({
        platform: PLATFORM,
        platformThreadId: conversationId,
        contactId: contact.id,
        subject: "dm"
      });
      this.brain.upsertMessage({
        platform: PLATFORM,
        platformMessageId: messageId,
        threadId: thread.id,
        contactId: contact.id,
        direction: "inbound",
        body: event.text ?? "",
        ...(event.created_at ? { sentAt: event.created_at } : {})
      });
      count += 1;
    }
    return { messages: count };
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const outcome = await this.dispatcher.dispatch<T>(
      { platform: this.platform, opKind: "twitter.poll.dm", payload: {} },
      fn
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }
}
