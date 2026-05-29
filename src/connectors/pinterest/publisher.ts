/**
 * Pinterest publisher (#63) — create boards and pins.
 *
 * Wraps the v5 endpoints `POST /boards` and `POST /pins`. A pin requires a
 * destination board, a media source (image URL), and optional title/description
 * /link. Every mutating call flows through {@link PinterestDispatcher} so it
 * shares the Pinterest rate-limit budget (#141) and retry/DLQ behaviour (#142).
 */
import type { PinterestDispatcher } from "./dispatcher.js";
import type { PinterestRestClient } from "./rest-client.js";

export interface PinterestCreateBoardRequest {
  name: string;
  description?: string;
  /** `PUBLIC` | `PROTECTED` | `SECRET`. Default `PUBLIC`. */
  privacy?: "PUBLIC" | "PROTECTED" | "SECRET";
}

export interface PinterestBoardResult {
  boardId: string;
}

export interface PinterestCreatePinRequest {
  boardId: string;
  /** Public image URL used as the pin media. */
  imageUrl: string;
  title?: string;
  description?: string;
  /** Destination link for the pin. */
  link?: string;
}

export interface PinterestPinResult {
  pinId: string;
}

export interface PinterestPublisherDeps {
  client: PinterestRestClient;
  dispatcher: PinterestDispatcher;
  /** Rate-limit budget key. Default `"pinterest"`. */
  platform?: string;
}

interface IdResponse {
  id?: string;
}

export class PinterestPublisher {
  private readonly client: PinterestRestClient;
  private readonly dispatcher: PinterestDispatcher;
  private readonly platform: string;

  constructor(deps: PinterestPublisherDeps) {
    this.client = deps.client;
    this.dispatcher = deps.dispatcher;
    this.platform = deps.platform ?? "pinterest";
  }

  /** Create a board, returning its id. */
  async createBoard(
    accessToken: string,
    req: PinterestCreateBoardRequest
  ): Promise<PinterestBoardResult> {
    const created = await this.run<IdResponse>("pinterest.board.create", req, () =>
      this.client.post<IdResponse>("/boards", {
        accessToken,
        body: {
          name: req.name,
          ...(req.description ? { description: req.description } : {}),
          privacy: req.privacy ?? "PUBLIC"
        }
      })
    );
    if (!created.id) throw new Error("pinterest createBoard returned no board id");
    return { boardId: created.id };
  }

  /** Create a pin on a board, returning its id. */
  async createPin(
    accessToken: string,
    req: PinterestCreatePinRequest
  ): Promise<PinterestPinResult> {
    const created = await this.run<IdResponse>(
      "pinterest.pin.create",
      { boardId: req.boardId },
      () =>
        this.client.post<IdResponse>("/pins", {
          accessToken,
          body: {
            board_id: req.boardId,
            ...(req.title ? { title: req.title } : {}),
            ...(req.description ? { description: req.description } : {}),
            ...(req.link ? { link: req.link } : {}),
            media_source: { source_type: "image_url", url: req.imageUrl }
          }
        })
    );
    if (!created.id) throw new Error("pinterest createPin returned no pin id");
    return { pinId: created.id };
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
