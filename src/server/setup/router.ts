/**
 * Setup-wizard API router (epic #129).
 *
 * Routes (all under `/api/setup`):
 *   - POST /validate-key       — validate a BYOK key + store it in the vault.
 *   - POST /telegram/verify    — verify a bot token, send a test message, store.
 *   - GET  /status             — wizard completion flags.
 *
 * Secret handling (OWASP): keys/tokens are accepted, validated, and stored
 * encrypted in the vault server-side only. They are NEVER echoed in responses
 * nor logged. Responses use a flat JSON envelope mirroring `/api/metrics`.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import type { CredentialVault } from "../../vault/index.js";
import {
  SETUP_PROVIDERS,
  validateProviderKey,
  type SetupProvider,
  type ValidateKeyResult
} from "./provider-validator.js";
import { verifyTelegram, type VerifyTelegramResult } from "./telegram-verify.js";

type FetchLike = typeof fetch;

export interface SetupRouterDeps {
  vault: CredentialVault;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injectable validators for tests. */
  validateKey?: typeof validateProviderKey;
  verifyTelegramFn?: typeof verifyTelegram;
}

const ValidateKeyBody = z
  .object({
    provider: z.enum(SETUP_PROVIDERS as unknown as [SetupProvider, ...SetupProvider[]]),
    apiKey: z.string().min(1, "apiKey is required"),
    baseUrl: z.string().min(1).optional(),
    model: z.string().min(1).optional()
  })
  .strict();

const TelegramBody = z
  .object({
    // Telegram bot tokens look like `123456:ABC-DEF...`.
    botToken: z.string().min(1, "botToken is required"),
    // chat ids are integers (possibly negative for groups); accept the string form.
    adminChatId: z
      .string()
      .trim()
      .regex(/^-?\d+$/, "adminChatId must be a numeric chat id")
  })
  .strict();

/** Build the setup router bound to a live vault. */
export function createSetupRouter(deps: SetupRouterDeps): Router {
  const router = Router();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const validateKey = deps.validateKey ?? validateProviderKey;
  const verifyTg = deps.verifyTelegramFn ?? verifyTelegram;

  router.post("/validate-key", (req: Request, res: Response): void => {
    void (async () => {
      const parsed = ValidateKeyBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
        return;
      }
      const { provider, apiKey, baseUrl, model } = parsed.data;

      let result: ValidateKeyResult;
      try {
        result = await validateKey({ provider, apiKey, baseUrl }, fetchImpl);
      } catch (err) {
        // Boundary error (e.g. blocked/invalid baseUrl from the SSRF guard).
        res.status(400).json({ error: err instanceof Error ? err.message : "invalid request" });
        return;
      }

      if (!result.valid) {
        res.status(200).json({ valid: false, provider, reason: result.reason ?? "invalid key" });
        return;
      }

      // Persist on success. Store only what we need; never echo the key back.
      await deps.vault.setProvider(provider, {
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {})
      });
      res.status(200).json({ valid: true, provider, stored: true });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  router.post("/telegram/verify", (req: Request, res: Response): void => {
    void (async () => {
      const parsed = TelegramBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
        return;
      }
      const { botToken, adminChatId } = parsed.data;

      const result: VerifyTelegramResult = await verifyTg({ botToken, adminChatId }, fetchImpl);
      if (!result.valid) {
        res.status(200).json({ valid: false, reason: result.reason ?? "verification failed" });
        return;
      }

      await deps.vault.setTelegram({ botToken, adminChatId });
      res.status(200).json({
        valid: true,
        stored: true,
        ...(result.botUsername ? { botUsername: result.botUsername } : {})
      });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  router.get("/status", (_req: Request, res: Response): void => {
    void (async () => {
      const vault = await deps.vault.load();
      const hasProvider = SETUP_PROVIDERS.some((p) => Boolean(vault.providers[p]?.apiKey));
      const hasTelegram = Boolean(vault.telegram?.botToken);
      res.status(200).json({
        complete: hasProvider && hasTelegram,
        hasProvider,
        hasTelegram
      });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  return router;
}
