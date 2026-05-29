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

export const VaultSchema = z
  .object({
    version: z.literal(1).default(1),
    providers: z.record(z.string(), ProviderCredentialSchema).default({}),
    oauth: z.record(z.string(), OAuthCredentialSchema).default({})
  })
  .strict();

export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;
export type OAuthCredential = z.infer<typeof OAuthCredentialSchema>;
export type Vault = z.infer<typeof VaultSchema>;

export const EMPTY_VAULT: Vault = { version: 1, providers: {}, oauth: {} };
