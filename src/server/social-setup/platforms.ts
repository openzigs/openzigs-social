/**
 * Per-platform OAuth setup metadata (epic #100, sub #105).
 *
 * Connectors implement only the code→token exchange; nobody owned the *start*
 * of the consent flow (the authorize URL). This module supplies the missing
 * half so the `social-setup-wizard` skill can drive a real per-platform OAuth
 * handshake: authorize endpoint, the scopes to request, and which vault
 * app-credential backs each platform's `client_id`.
 *
 * The redirect URI always points at the shared callback router
 * (`/oauth/callback/:platform`), so the existing CSRF-state + vault-persist
 * machinery handles the back half of the flow unchanged.
 */
import type { CredentialVault } from "../../vault/index.js";

/** Platforms the wizard can drive an OAuth flow for, in display order. */
export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "threads",
  "linkedin",
  "pinterest",
  "tiktok",
  "twitter"
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Which vault app-credential record backs a platform's client id/secret. */
export type CredentialKind = "meta" | "linkedin" | "pinterest" | "tiktok" | "twitter";

export interface PlatformSetupMeta {
  platform: SocialPlatform;
  label: string;
  /** OAuth 2.0 authorize endpoint. */
  authUrl: string;
  /** Scopes requested at consent time. */
  scopes: string[];
  /** Vault credential backing this platform. */
  credential: CredentialKind;
  /** Query-param name carrying the client id (TikTok uses `client_key`). */
  clientParam: "client_id" | "client_key";
  /** Scope separator in the authorize URL (TikTok uses commas). */
  scopeSeparator: " " | ",";
}

export const PLATFORM_SETUP: Record<SocialPlatform, PlatformSetupMeta> = {
  instagram: {
    platform: "instagram",
    label: "Instagram",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    credential: "meta",
    clientParam: "client_id",
    scopeSeparator: " "
  },
  facebook: {
    platform: "facebook",
    label: "Facebook Pages",
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    scopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
    credential: "meta",
    clientParam: "client_id",
    scopeSeparator: " "
  },
  threads: {
    platform: "threads",
    label: "Threads",
    authUrl: "https://threads.net/oauth/authorize",
    scopes: ["threads_basic", "threads_content_publish"],
    credential: "meta",
    clientParam: "client_id",
    // Threads' authorize endpoint expects comma-delimited scopes, unlike the
    // Facebook/Instagram dialog (space-delimited) that shares the `meta`
    // credential — per the Threads API docs. Do not "normalize" to a space.
    scopeSeparator: ","
  },
  linkedin: {
    platform: "linkedin",
    label: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scopes: ["w_member_social", "r_liteprofile"],
    credential: "linkedin",
    clientParam: "client_id",
    scopeSeparator: " "
  },
  pinterest: {
    platform: "pinterest",
    label: "Pinterest",
    authUrl: "https://www.pinterest.com/oauth/",
    scopes: ["boards:read", "pins:read", "pins:write"],
    credential: "pinterest",
    clientParam: "client_id",
    scopeSeparator: " "
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    scopes: ["user.info.basic", "video.upload", "video.publish"],
    credential: "tiktok",
    clientParam: "client_key",
    scopeSeparator: ","
  },
  twitter: {
    platform: "twitter",
    label: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    credential: "twitter",
    clientParam: "client_id",
    scopeSeparator: " "
  }
};

/** Narrow an arbitrary string to a known platform key. */
export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/**
 * Resolve a platform's app `client_id` from the vault (BYOK). Returns
 * `undefined` when the operator has not yet configured the app credentials.
 * The app *secret* is never read here — it is only needed at code-exchange
 * time inside the connector.
 */
export async function resolveClientId(
  vault: CredentialVault,
  credential: CredentialKind
): Promise<string | undefined> {
  switch (credential) {
    case "meta":
      return (await vault.getMeta())?.appId;
    case "linkedin":
      return (await vault.getLinkedIn())?.clientId;
    case "pinterest":
      return (await vault.getPinterest())?.appId;
    case "tiktok":
      return (await vault.getTikTok())?.clientKey;
    case "twitter":
      return (await vault.getTwitter())?.clientId;
  }
}

/**
 * Build a per-platform OAuth authorize URL. `state` is the CSRF token minted by
 * the {@link OAuthStateStore}; `redirectUri` must equal the callback the
 * connector will validate against.
 */
export function buildAuthorizeUrl(
  meta: PlatformSetupMeta,
  params: { clientId: string; redirectUri: string; state: string }
): string {
  const url = new URL(meta.authUrl);
  url.searchParams.set(meta.clientParam, params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", meta.scopes.join(meta.scopeSeparator));
  url.searchParams.set("state", params.state);
  return url.toString();
}
