/**
 * Outbox publisher dispatch (#84 — v1 direct-to-connector).
 *
 * v1 drops the universal-publisher skill abstraction: the outbox poller calls
 * the platform connector publishers directly through this small per-platform
 * dispatch map. Each connector's existing publisher (e.g.
 * {@link TwitterPublisher.publish}) is wrapped once at server start in an
 * {@link OutboxPublisher} adapter and registered here keyed by platform. The
 * poller owns NO platform-specific publish logic — it only looks up the adapter
 * for a row's platform and calls {@link OutboxPublisher.publish}.
 */
import type { OutboxMedia } from "./repository.js";

/** Normalised publish request handed to a platform adapter. */
export interface PublishInput {
  platform: string;
  accountId?: string;
  body: string;
  media: OutboxMedia[];
}

/** Result of a successful publish. */
export interface PublishResult {
  /** Platform-native id of the created post, when the platform returns one. */
  externalId?: string;
}

/** A platform adapter the poller can call to publish one post. */
export interface OutboxPublisher {
  publish(input: PublishInput): Promise<PublishResult>;
}

/** Thrown when no publisher is registered for a platform. */
export class NoPublisherError extends Error {
  readonly platform: string;
  constructor(platform: string) {
    super(`no outbox publisher registered for platform "${platform}"`);
    this.name = "NoPublisherError";
    this.platform = platform;
  }
}

/** Per-platform registry of {@link OutboxPublisher} adapters. */
export class OutboxDispatch {
  private readonly publishers = new Map<string, OutboxPublisher>();

  /** Register (or replace) the adapter for a platform key (case-insensitive). */
  register(platform: string, publisher: OutboxPublisher): this {
    this.publishers.set(platform.toLowerCase(), publisher);
    return this;
  }

  /** Whether a publisher is registered for the platform. */
  has(platform: string): boolean {
    return this.publishers.has(platform.toLowerCase());
  }

  /** Resolve the adapter for a platform, or `undefined`. */
  get(platform: string): OutboxPublisher | undefined {
    return this.publishers.get(platform.toLowerCase());
  }

  /** The registered platform keys. */
  platforms(): string[] {
    return [...this.publishers.keys()];
  }

  /** Publish via the registered adapter, throwing {@link NoPublisherError}. */
  async publish(input: PublishInput): Promise<PublishResult> {
    const publisher = this.get(input.platform);
    if (!publisher) throw new NoPublisherError(input.platform);
    return publisher.publish(input);
  }
}
