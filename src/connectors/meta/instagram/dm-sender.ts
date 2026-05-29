/**
 * Instagram outbound DM adapter (#55 / wiring the #51 port).
 *
 * Implements the platform-service {@link SocialDmSender} port so the Telegram
 * remote-control relay can deliver a DM "as the user" on Instagram. Sends via
 * the Messenger Graph API: `POST /{ig-user-id}/messages` with a JSON
 * `recipient` + `message`. The call flows through {@link MetaDispatcher} for
 * the shared rate-limit budget + retry/DLQ behaviour.
 */
import type {
  SocialDmRequest,
  SocialDmResult,
  SocialDmSender
} from "../../../channels/social/dm-sender.js";
import type { MetaDispatcher } from "../dispatcher.js";
import type { MetaGraphClient } from "../graph-client.js";
import type { IgAccount } from "./publisher.js";

export interface InstagramDmSenderDeps {
  client: MetaGraphClient;
  dispatcher: MetaDispatcher;
  /** Resolves the IG account that sends the DM (the connected business user). */
  getAccount: () => Promise<IgAccount | undefined>;
  /** Rate-limit budget key. Default `"meta"`. */
  platform?: string;
  /** Injectable clock for the delivery timestamp. */
  now?: () => number;
}

interface SendMessageResponse {
  message_id?: string;
  recipient_id?: string;
}

export class InstagramDmSender implements SocialDmSender {
  private readonly client: MetaGraphClient;
  private readonly dispatcher: MetaDispatcher;
  private readonly getAccount: () => Promise<IgAccount | undefined>;
  private readonly platform: string;
  private readonly now: () => number;

  constructor(deps: InstagramDmSenderDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.getAccount = deps.getAccount;
    this.platform = deps.platform ?? "meta";
    this.now = deps.now ?? Date.now;
  }

  supports(platform: string): boolean {
    return platform.toLowerCase() === "instagram";
  }

  async sendDm(request: SocialDmRequest): Promise<SocialDmResult> {
    const account = await this.getAccount();
    if (!account) {
      throw new Error("no connected Instagram account to send DM from");
    }

    const outcome = await this.dispatcher.dispatch<SendMessageResponse>(
      {
        platform: this.platform,
        opKind: "instagram.dm.send",
        payload: { to: request.recipientId }
      },
      () =>
        this.client.post<SendMessageResponse>(`/${account.igUserId}/messages`, {
          accessToken: account.accessToken,
          body: {
            recipient: JSON.stringify({ id: request.recipientId }),
            message: JSON.stringify({ text: request.text })
          }
        })
    );
    if (!outcome.ok) throw outcome.error;

    return {
      platform: "instagram",
      recipientId: request.recipientId,
      ...(outcome.value.message_id ? { messageId: outcome.value.message_id } : {}),
      deliveredAt: this.now()
    };
  }
}
