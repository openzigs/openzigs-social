/**
 * Connector → outbox publisher adapters (#84/#86).
 *
 * The outbox poller speaks one narrow port — {@link OutboxPublisher} — while
 * each platform connector exposes a publisher with its own bespoke signature
 * (X wants `(accessToken, { text })`, LinkedIn wants an author URN + token).
 * These adapters bridge the two and pull the per-platform access token from the
 * encrypted vault at publish time (BYOK; tokens are never stored on the outbox
 * row and never logged).
 *
 * v1 wires the two text-first surfaces (X and LinkedIn). Platforms without an
 * adapter are simply not registered: the poller dead-letters their due posts
 * with a clear "no publisher" error rather than silently dropping them.
 */
import type { CredentialVault } from "../../vault/index.js";
import type { TwitterPublisher } from "../../connectors/twitter/publisher.js";
import type { LinkedInAuthorKind, LinkedInPublisher } from "../../connectors/linkedin/publisher.js";
import { OutboxDispatch, type OutboxPublisher } from "../../outbox/dispatch.js";

export interface BuildOutboxDispatchDeps {
  vault: Pick<CredentialVault, "getOAuth">;
  twitter?: TwitterPublisher;
  linkedin?: LinkedInPublisher;
}

/** X (Twitter) adapter: token from the vault, body → tweet text. */
function twitterAdapter(
  vault: BuildOutboxDispatchDeps["vault"],
  publisher: TwitterPublisher
): OutboxPublisher {
  return {
    async publish(input) {
      const token = await vault.getOAuth("twitter");
      if (!token) throw new Error("no X (Twitter) access token in vault");
      const result = await publisher.publish(token.accessToken, { text: input.body });
      return { externalId: result.tweetId };
    }
  };
}

/**
 * LinkedIn adapter: token from the vault, body → commentary. The outbox
 * `accountId` selects the author as `"<kind>:<id>"` (e.g. `member:abc`,
 * `organization:123`); a bare id defaults to a member author.
 */
function linkedinAdapter(
  vault: BuildOutboxDispatchDeps["vault"],
  publisher: LinkedInPublisher
): OutboxPublisher {
  return {
    async publish(input) {
      const token = await vault.getOAuth("linkedin");
      if (!token) throw new Error("no LinkedIn access token in vault");
      if (!input.accountId) throw new Error("LinkedIn post requires an author accountId");
      const [maybeKind, maybeId] = input.accountId.split(":");
      const kind: LinkedInAuthorKind = maybeKind === "organization" ? "organization" : "member";
      const id = maybeId ?? input.accountId;
      const result = await publisher.publish(
        { kind, id, accessToken: token.accessToken },
        { commentary: input.body }
      );
      return { externalId: result.postId };
    }
  };
}

/** Build the per-platform dispatch from the available connector publishers. */
export function buildOutboxDispatch(deps: BuildOutboxDispatchDeps): OutboxDispatch {
  const dispatch = new OutboxDispatch();
  if (deps.twitter) dispatch.register("twitter", twitterAdapter(deps.vault, deps.twitter));
  if (deps.linkedin) dispatch.register("linkedin", linkedinAdapter(deps.vault, deps.linkedin));
  return dispatch;
}
