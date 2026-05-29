/**
 * Configuration schema (Zod) for openzigs-social.
 *
 * A single schema validates the *merged* result of the layered config
 * (default.json -> user.json -> env). Invalid config fails fast with a
 * readable error. See ./index.ts for the layering logic.
 */
import { z } from "zod";

/**
 * Boolean that also accepts the string forms env vars produce
 * (`"true"`/`"false"`/`"1"`/`"0"`...). `z.coerce.boolean()` is unusable here
 * because it treats any non-empty string (including `"false"`) as `true`.
 */
const booleanish = z.preprocess((v) => {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["false", "0", "no", "off", ""].includes(s)) return false;
    if (["true", "1", "yes", "on"].includes(s)) return true;
  }
  return v;
}, z.boolean());

export const ConfigSchema = z
  .object({
    server: z
      .object({
        /** Loopback bind address. */
        host: z.string().min(1).default("127.0.0.1"),
        /** HTTP + Socket.IO port. 0 lets the OS pick an ephemeral port. */
        port: z.coerce.number().int().min(0).max(65535).default(3000),
        /** Allowed UI origin for CORS (Socket.IO + REST). */
        uiOrigin: z.string().url().default("http://localhost:3001")
      })
      .strict()
      .default({}),
    logging: z
      .object({
        level: z.enum(["error", "warn", "info", "debug"]).default("info"),
        /** Write a rotating log file under <dataDir>/logs in addition to stdout. */
        toFile: booleanish.default(true)
      })
      .strict()
      .default({}),
    privacy: z
      .object({
        /** Hard kill-switch forcing local-only LLM routing. */
        mode: z.enum(["off", "session", "global"]).default("off")
      })
      .strict()
      .default({}),
    telegram: z
      .object({
        /**
         * Whether the Telegram channel runs. The bot token + primary admin
         * chat id live in the encrypted vault, never here — this is only the
         * non-secret on/off switch and runtime tuning.
         */
        enabled: booleanish.default(false),
        /** Transport mode. Only `"polling"` is wired in v1. */
        mode: z.enum(["polling", "webhook"]).default("polling"),
        /**
         * Approval auto-decision timeout in ms. `0` means wait indefinitely for
         * a human decision (the default).
         */
        approvalTimeoutMs: z.coerce.number().int().nonnegative().default(0),
        /**
         * Additional admin chat ids allowed to command the bot, beyond the
         * primary admin chat id stored in the vault. Deny-by-default: an empty
         * list plus no vault admin means the bot obeys nobody.
         */
        adminChatIds: z.array(z.string().min(1)).default([])
      })
      .strict()
      .default({}),
    platform: z
      .object({
        /**
         * Inbound webhook receiver (#140). Disabled by default; connectors
         * register HMAC-verified handlers and the router only mounts when on.
         */
        webhooks: z
          .object({
            enabled: booleanish.default(false),
            /** Max accepted webhook body size in bytes (DoS guard). */
            maxBodyBytes: z.coerce
              .number()
              .int()
              .positive()
              .default(1024 * 1024)
          })
          .strict()
          .default({}),
        /**
         * OAuth callback router (#139). Disabled by default; mounts only when
         * a connector has registered a token exchanger.
         */
        oauth: z
          .object({
            enabled: booleanish.default(false),
            /** Same-origin relative path the UI is sent to after connecting. */
            successRedirect: z.string().min(1).default("/"),
            /** CSRF state lifetime in ms. */
            stateTtlMs: z.coerce
              .number()
              .int()
              .positive()
              .default(10 * 60 * 1000)
          })
          .strict()
          .default({}),
        /**
         * Meta (Instagram / Facebook Pages / Threads) connector — Cohort A
         * (#53). Opt-in; the Meta app id/secret + per-account tokens live in
         * the encrypted vault (BYOK), never here. This block only carries the
         * non-secret on/off switch, Graph hosts, rate-limit budgets, and the
         * polling-fallback cadence.
         */
        meta: z
          .object({
            enabled: booleanish.default(false),
            /** Facebook/Instagram Graph host base (override for testing). */
            graphBaseUrl: z.string().url().default("https://graph.facebook.com/v25.0"),
            /** Threads Graph host base (override for testing). */
            threadsBaseUrl: z.string().url().default("https://graph.threads.net/v25.0"),
            /** Shared rate-limit budget: requests per window. */
            budget: z
              .object({
                requests: z.coerce.number().int().positive().default(200),
                windowMs: z.coerce
                  .number()
                  .int()
                  .positive()
                  .default(60 * 60 * 1000)
              })
              .strict()
              .default({}),
            /** Polling-fallback cadence (ms) when webhooks are off/miss. */
            pollIntervalMs: z.coerce
              .number()
              .int()
              .positive()
              .default(5 * 60 * 1000)
          })
          .strict()
          .default({})
      })
      .strict()
      .default({})
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;
