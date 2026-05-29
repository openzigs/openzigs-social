/**
 * Credential vault types.
 *
 * Vault file lives at `~/.openzigs-social/auth.json` with mode 0o600.
 * Parent directory is 0o700. All secrets are AES-256-GCM envelope encrypted.
 */
import { z } from "zod";

export const ProviderCredentialSchema = z
  .object({
    apiKey: z.string().min(1).optional(),
    baseUrl: z.string().url().optional(),
    model: z.string().optional()
  })
  .strict();

export const OAuthCredentialSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).optional(),
    /** Unix epoch ms when accessToken expires. */
    expiresAt: z.number().int().positive().optional(),
    /** Marked true when a refresh attempt has hard-failed. */
    needsReconsent: z.boolean().optional()
  })
  .strict();

/**
 * Telegram bot credentials captured by the setup wizard (epic #129, sub #104).
 * The bot token is treated like any other secret — encrypted at rest, never
 * logged, never echoed in API responses.
 */
export const TelegramCredentialSchema = z
  .object({
    botToken: z.string().min(1),
    adminChatId: z.string().min(1)
  })
  .strict();

/**
 * Meta app credentials for Cohort A connectors (epic #53). The app id is not
 * strictly secret but the app secret is — both live encrypted in the vault so
 * the OAuth code-exchange (Instagram/Facebook/Threads) can sign requests at
 * runtime. They are never logged nor echoed in API responses.
 */
export const MetaAppCredentialSchema = z
  .object({
    appId: z.string().min(1),
    appSecret: z.string().min(1)
  })
  .strict();

/**
 * LinkedIn app credentials for the Cohort B connector (epic #60, sub #61/#62).
 * Standard OAuth 2.0 client id + secret (BYOK). The secret signs the
 * code→token exchange at runtime and is never logged nor echoed.
 */
export const LinkedInAppCredentialSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1)
  })
  .strict();

/**
 * Pinterest app credentials for the Cohort B connector (epic #60, sub #63).
 * v5 OAuth uses an app id + secret sent as HTTP Basic auth on token exchange.
 */
export const PinterestAppCredentialSchema = z
  .object({
    appId: z.string().min(1),
    appSecret: z.string().min(1)
  })
  .strict();

/**
 * TikTok app credentials for the Cohort B connector (epic #60, sub #64/#65).
 * Uses a client key + client secret. Until the app passes TikTok's content
 * audit, publishing is constrained to PRIVATE (`SELF_ONLY`) posts.
 */
export const TikTokAppCredentialSchema = z
  .object({
    clientKey: z.string().min(1),
    clientSecret: z.string().min(1)
  })
  .strict();

export const VaultSchema = z
  .object({
    version: z.literal(1).default(1),
    providers: z.record(z.string(), ProviderCredentialSchema).default({}),
    oauth: z.record(z.string(), OAuthCredentialSchema).default({}),
    telegram: TelegramCredentialSchema.optional(),
    meta: MetaAppCredentialSchema.optional(),
    linkedin: LinkedInAppCredentialSchema.optional(),
    pinterest: PinterestAppCredentialSchema.optional(),
    tiktok: TikTokAppCredentialSchema.optional()
  })
  .strict();

export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;
export type OAuthCredential = z.infer<typeof OAuthCredentialSchema>;
export type TelegramCredential = z.infer<typeof TelegramCredentialSchema>;
export type MetaAppCredential = z.infer<typeof MetaAppCredentialSchema>;
export type LinkedInAppCredential = z.infer<typeof LinkedInAppCredentialSchema>;
export type PinterestAppCredential = z.infer<typeof PinterestAppCredentialSchema>;
export type TikTokAppCredential = z.infer<typeof TikTokAppCredentialSchema>;
export type Vault = z.infer<typeof VaultSchema>;

export const EMPTY_VAULT: Vault = { version: 1, providers: {}, oauth: {} };
