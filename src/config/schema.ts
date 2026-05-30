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
          .default({}),
        /**
         * LinkedIn connector — Cohort B (#61/#62). Opt-in; the LinkedIn app
         * client id/secret + per-account tokens live in the encrypted vault
         * (BYOK), never here. v1 publishes posts + reads comments/analytics
         * only — no DMs (Compliance Partner Program gated).
         */
        linkedin: z
          .object({
            enabled: booleanish.default(false),
            /** LinkedIn REST host base (override for testing). */
            restBaseUrl: z.string().url().default("https://api.linkedin.com/rest"),
            /** Shared rate-limit budget: requests per window. */
            budget: z
              .object({
                requests: z.coerce.number().int().positive().default(100),
                windowMs: z.coerce
                  .number()
                  .int()
                  .positive()
                  .default(24 * 60 * 60 * 1000)
              })
              .strict()
              .default({}),
            /** Polling cadence (ms) for comments + analytics. */
            pollIntervalMs: z.coerce
              .number()
              .int()
              .positive()
              .default(5 * 60 * 1000)
          })
          .strict()
          .default({}),
        /**
         * Pinterest connector — Cohort B (#63). Opt-in; the Pinterest app
         * id/secret + per-account tokens live in the encrypted vault (BYOK),
         * never here. v1 creates boards/pins + reads pin analytics.
         */
        pinterest: z
          .object({
            enabled: booleanish.default(false),
            /** Pinterest API v5 host base (override for testing). */
            apiBaseUrl: z.string().url().default("https://api.pinterest.com/v5"),
            /** Shared rate-limit budget: requests per window. */
            budget: z
              .object({
                requests: z.coerce.number().int().positive().default(1000),
                windowMs: z.coerce
                  .number()
                  .int()
                  .positive()
                  .default(60 * 60 * 1000)
              })
              .strict()
              .default({}),
            /** Polling cadence (ms) for pin analytics. */
            pollIntervalMs: z.coerce
              .number()
              .int()
              .positive()
              .default(5 * 60 * 1000)
          })
          .strict()
          .default({}),
        /**
         * TikTok connector — Cohort B (#64/#65). Opt-in; the TikTok client
         * key/secret + per-account tokens live in the encrypted vault (BYOK),
         * never here. v1 is constrained to PRIVATE (`SELF_ONLY`) publishing
         * until the app passes TikTok's content-posting audit.
         */
        tiktok: z
          .object({
            enabled: booleanish.default(false),
            /** TikTok Open API v2 host base (override for testing). */
            apiBaseUrl: z.string().url().default("https://open.tiktokapis.com/v2"),
            /** Shared rate-limit budget: requests per window. */
            budget: z
              .object({
                requests: z.coerce.number().int().positive().default(600),
                windowMs: z.coerce
                  .number()
                  .int()
                  .positive()
                  .default(24 * 60 * 60 * 1000)
              })
              .strict()
              .default({}),
            /** Polling cadence (ms) for video + profile display data. */
            pollIntervalMs: z.coerce
              .number()
              .int()
              .positive()
              .default(5 * 60 * 1000)
          })
          .strict()
          .default({}),
        /**
         * X (Twitter) v2 connector — Cohort C (#66). Opt-in; the X app client
         * id/secret + per-account OAuth tokens live in the encrypted vault
         * (BYOK), never here. This block carries only non-secret settings: the
         * on/off switch, API/token hosts, the access tier (Free/Basic/Pro), the
         * per-tier monthly write-quota caps surfaced in the model panel, the
         * short-window rate-limit budgets (general writes + the X DM limit of
         * 15 req/15 min, 1440/24 hr), the threshold-warning ratio, and the DM
         * feature flag (DISABLED BY DEFAULT — only ever on for paid tiers).
         */
        twitter: z
          .object({
            enabled: booleanish.default(false),
            /** X v2 API host base (override for testing). */
            apiBaseUrl: z.string().url().default("https://api.twitter.com/2"),
            /** X OAuth 2.0 token endpoint (override for testing). */
            tokenUrl: z.string().url().default("https://api.twitter.com/2/oauth2/token"),
            /** Access tier governing write budgets + DM availability. */
            tier: z.enum(["free", "basic", "pro"]).default("free"),
            /**
             * Inbound + outbound DM. Off by default and force-disabled on the
             * Free tier regardless of this flag (X gates DM behind paid access).
             */
            dmEnabled: booleanish.default(false),
            /** Per-tier monthly X API write-quota caps (posts/replies/DMs). */
            writeQuota: z
              .object({
                free: z.coerce.number().int().positive().default(1_500),
                basic: z.coerce.number().int().positive().default(50_000),
                pro: z.coerce.number().int().positive().default(1_000_000)
              })
              .strict()
              .default({}),
            /** Utilisation ratio in (0,1] at which to warn the user. */
            warnThreshold: z.coerce.number().min(0.1).max(1).default(0.8),
            /** General write rate-limit budget (token bucket). */
            budget: z
              .object({
                requests: z.coerce.number().int().positive().default(50),
                windowMs: z.coerce
                  .number()
                  .int()
                  .positive()
                  .default(15 * 60 * 1000)
              })
              .strict()
              .default({}),
            /** X DM rate-limit: 15 requests / 15 min per user, 1440 / 24 hr. */
            dmBudget: z
              .object({
                requests: z.coerce.number().int().positive().default(15),
                windowMs: z.coerce
                  .number()
                  .int()
                  .positive()
                  .default(15 * 60 * 1000),
                dailyQuota: z.coerce.number().int().positive().default(1_440)
              })
              .strict()
              .default({}),
            /** Polling cadence (ms) for DM ingest + tweet analytics. */
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
