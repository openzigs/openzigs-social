import { describe, expect, it, vi } from "vitest";

import type { DlqEntry, DlqInput, DlqRepository, RateLimitBroker } from "../../platform/index.js";
import { LinkedInDispatcher } from "./dispatcher.js";
import { authorUrn, LinkedInPublisher, type LinkedInAuthor } from "./publisher.js";
import { LinkedInRestClient, type FetchLike } from "./rest-client.js";

function grantedBroker(): RateLimitBroker {
  return { acquire: vi.fn(async () => ({ granted: true })) } as unknown as RateLimitBroker;
}

function fakeDlq(): { repo: DlqRepository; landed: DlqInput[] } {
  const landed: DlqInput[] = [];
  let id = 0;
  const repo = {
    land: vi.fn((input: DlqInput): DlqEntry => {
      landed.push(input);
      id += 1;
      return { id, ...input, payloadJson: "{}", createdAt: "now" } as unknown as DlqEntry;
    })
  } as unknown as DlqRepository;
  return { repo, landed };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function build(fetchImpl: FetchLike) {
  const client = new LinkedInRestClient({ fetchImpl });
  const dispatcher = new LinkedInDispatcher({
    broker: grantedBroker(),
    dlq: fakeDlq().repo,
    retryOptions: { sleep: async () => undefined, random: () => 0 }
  });
  return new LinkedInPublisher({ client, dispatcher });
}

const member: LinkedInAuthor = { kind: "member", id: "abc", accessToken: "tok" };
const org: LinkedInAuthor = { kind: "organization", id: "999", accessToken: "tok" };

describe("authorUrn", () => {
  it("builds member and organization URNs", () => {
    expect(authorUrn(member)).toBe("urn:li:person:abc");
    expect(authorUrn(org)).toBe("urn:li:organization:999");
  });
});

describe("LinkedInPublisher", () => {
  it("publishes a member post with the versioned Posts contract", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, { id: "urn:li:share:1" }));
    const publisher = build(fetchImpl);

    const result = await publisher.publish(member, { commentary: "hello world" });

    expect(result).toEqual({ postId: "urn:li:share:1" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("/posts");
    const body = JSON.parse(init?.body as string);
    expect(body.author).toBe("urn:li:person:abc");
    expect(body.commentary).toBe("hello world");
    expect(body.visibility).toBe("PUBLIC");
    expect(body.lifecycleState).toBe("PUBLISHED");
    expect(body.distribution.feedDistribution).toBe("MAIN_FEED");
  });

  it("publishes an organization post with the org author URN", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, { id: "urn:li:share:2" }));
    const publisher = build(fetchImpl);

    await publisher.publish(org, { commentary: "co post", visibility: "CONNECTIONS" });

    const body = JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string);
    expect(body.author).toBe("urn:li:organization:999");
    expect(body.visibility).toBe("CONNECTIONS");
  });

  it("throws when no post id is returned", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(201, {}));
    const publisher = build(fetchImpl);
    await expect(publisher.publish(member, { commentary: "x" })).rejects.toThrow(/no post id/);
  });

  it("propagates a terminal API error from the dispatcher", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(401, { message: "bad token" }));
    const publisher = build(fetchImpl);
    await expect(publisher.publish(member, { commentary: "x" })).rejects.toMatchObject({
      name: "LinkedInApiError",
      httpStatus: 401
    });
  });
});
