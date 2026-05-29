# User guide

> Living document. Filled in as user-facing features land.

## Table of contents

1. Install
   - Desktop (Tauri) — macOS
   - Desktop (Tauri) — Windows
   - Self-host (docker-compose)
2. First-run setup wizard
   - Choose your LLM (local Ollama / BYOK / Copilot)
   - Connect Telegram for remote control
   - Connect platforms (Twitter/X, LinkedIn, Instagram, Facebook, YouTube, TikTok, Pinterest)
   - Per-user Meta app walkthrough
3. The unified inbox
4. Compose + schedule (calendar view)
5. AI auto-reply with brand voice
   - Brand-voice rulebook
   - Confidence threshold
   - Hybrid posture (auto vs queued)
6. Light CRM (contacts, lead scoring, history)
7. Analytics dashboard
8. Approvals over Telegram
9. Privacy mode
10. Troubleshooting

## 2. First-run setup wizard

(Currently a minimal skeleton — epic #129. The polished, guided onboarding
experience is tracked in #100.)

Open `/setup` in the app. The wizard has three steps and remembers your
progress if you refresh or close the tab:

1. **Welcome** — a short intro. Click **Next** to begin.
2. **AI provider** — pick **OpenAI**, **Anthropic**, or **OpenAI-compatible**,
   then paste your BYOK API key (for OpenAI-compatible, also enter the base
   URL). Click **Validate & save** — the local server checks the key against
   the provider's `/models` endpoint and, on success, stores it encrypted in
   the vault. Your key is never displayed again and never leaves your machine
   beyond that one validation call.
3. **Telegram** — create a bot with [@BotFather](https://t.me/BotFather), then
   enter its **bot token** and your numeric **admin chat id**. Click **Verify &
   save** — the server confirms the bot via `getMe` and sends a one-time test
   message to your admin chat. If it arrives, you're connected.

Only your *progress* is stored in the browser — secrets are held server-side in
the encrypted vault (see §10). Telegram here is a minimal connection check; the
full Telegram control surface is described in §8.

## 4. Connecting Meta accounts + composing

openzigs-social can publish to **Instagram**, **Facebook Pages**, and
**Threads** through the Meta Graph API (epic #53). This is opt-in: the
connectors stay dark until you set `platform.meta.enabled = true` in your
config (see §12) and restart the server. With it off, no Meta network calls are
ever made.

**Connecting an account.** You connect each platform with your own Meta app
(BYOK) — the app id/secret and the per-account access tokens are stored
encrypted in the vault and are never displayed or logged. After completing the
Meta OAuth handshake, the account shows up as connected.

**Check what's connected.** The composer reads `GET /api/connections`, which
reports each platform's status — `connected`, `needsReconsent` (token expired or
revoked), and a label (Instagram / Facebook Pages / Threads). The endpoint never
returns the tokens themselves.

**Compose + pick targets.** Open `/compose`. Under **Publish to** you'll see a
checkbox for each platform. Connected accounts are selectable; accounts that
aren't connected (or need reconnecting) are shown disabled with a hint. Tick the
accounts you want, write your post, and the footer shows exactly where it will
publish.

## 5. Connecting LinkedIn, Pinterest & TikTok (Cohort B)

openzigs-social can also publish to **LinkedIn**, **Pinterest**, and **TikTok**
(epic #60). Each is independently opt-in — set the matching flag and restart:

```json
{
  "platform": {
    "linkedin": { "enabled": true },
    "pinterest": { "enabled": true },
    "tiktok": { "enabled": true }
  }
}
```

(or `OPENZIGS_SOCIAL_PLATFORM_LINKEDIN_ENABLED=true`, `…_PINTEREST_ENABLED`,
`…_TIKTOK_ENABLED`). With a flag off, that platform makes no network calls.

As with Meta, you bring your own app (BYOK): LinkedIn client id/secret,
Pinterest app id/secret, TikTok client key/secret, and per-account tokens are
all stored encrypted in the vault and never displayed or logged. After the OAuth
handshake the account appears as connected in the composer's **Publish to** list
alongside the Meta platforms.

### Known limitations

* **LinkedIn — no direct messages.** LinkedIn DM access is gated behind the
  Compliance Partner Program. In v1, LinkedIn supports publishing posts (as a
  member or organization) and reading comments + analytics only — there is no DM
  sending or receiving, and the app refuses any messaging permission scope.
* **TikTok — posts are private until audited.** TikTok requires apps to pass a
  content-posting audit before they may publish publicly. Until then, every
  TikTok video this app publishes is forced to **PRIVATE** (`SELF_ONLY`),
  visible only to the connected account owner. The composer shows a notice
  whenever you select TikTok. Public posting unlocks automatically once your
  app's audit is approved by TikTok — no app changes are needed beyond that
  approval.

## 8. Approvals over Telegram

Once a bot is connected and the channel is enabled, Telegram becomes your
remote control. The bot is **deny-by-default**: it only obeys your configured
admin chat and ignores everyone else.

Enable it in config:

```json
{ "telegram": { "enabled": true } }
```

(or `OPENZIGS_SOCIAL_TELEGRAM_ENABLED=true`). The channel starts with the
server; if credentials are missing it simply stays off and the server still
runs. Full setup steps live in [docs/TELEGRAM_SETUP.md](TELEGRAM_SETUP.md).

**Commands:** `/start`, `/status`, `/privacy`, `/queue`, and
`/dm <platform> <recipient> <message>`.

**Approving actions:** when something needs sign-off, the bot sends a message
with ✅ Approve / ❌ Reject buttons. Tapping one settles the request and the
message updates to show the outcome (Approved / Rejected / Timed out). `/queue`
lists everything still pending.

**DM relay:** `/dm` sends a direct message as you on a connected platform. Until
a social platform is connected, the bot reports that DM delivery is unavailable
rather than faking a send.

## 9. Privacy mode

Three modes:

* **off** — smart router is free to escalate long prompts to your
  configured cloud provider (OpenAI / Anthropic / OpenAI-compatible).
  Short prompts (≤ 4 096 estimated tokens by default) always stay local.
* **session** — every prompt in the current process routes to your local
  Ollama / Gemma 4 instance. Existing sessions switch on the next turn.
  Cloud providers stay configured but unused.
* **global** — persistent kill-switch. Cloud providers refuse to be
  constructed at all; the smart router can only see your local provider.
  Use this when you must guarantee no prompt ever leaves the host.

Switch modes from the UI privacy panel or programmatically via
`wrapper.setPrivacyMode("session" | "global" | "off")`.

## 10. Where are my credentials stored?

In an encrypted vault at `~/.openzigs-social/auth.json` (file mode
`0o600`, parent directory `0o700`). The vault uses AES-256-GCM envelope
encryption with a key derived from your machine identifier. All API keys,
OAuth refresh tokens, and per-provider settings live there — nothing is
ever written to disk in plaintext.

## 12. Where is my data, and how do I configure it?

Everything openzigs-social writes lives under a single data directory:

* **Default:** `~/.openzigs-social/`
* **Override:** set the `OPENZIGS_SOCIAL_HOME` environment variable to point
  somewhere else (the sandboxed macOS app uses this automatically).

That directory holds the SQLite database (`openzigs-social.db`), the
credential vault (`auth.json`), your config overlay (`user.json`), rotating
logs (`logs/`), the audit log (`audit/audit.jsonl`), and chat transcripts
(`sessions/`).

Configuration is layered, with each layer overriding the one before it:

1. Built-in defaults (`config/default.json`)
2. Your overlay at `<dataDir>/user.json`
3. Environment variables

Supported environment overrides:

| Variable | Setting | Example |
|---|---|---|
| `OPENZIGS_SOCIAL_SERVER_HOST` | Bind address | `127.0.0.1` |
| `OPENZIGS_SOCIAL_SERVER_PORT` | HTTP/Socket.IO port (`0` = OS-assigned) | `3000` |
| `OPENZIGS_SOCIAL_UI_ORIGIN` | Allowed UI origin (CORS) | `http://localhost:3001` |
| `OPENZIGS_SOCIAL_LOG_LEVEL` | `error` / `warn` / `info` / `debug` | `info` |
| `OPENZIGS_SOCIAL_LOG_TO_FILE` | Write rotating log files | `true` / `false` |
| `OPENZIGS_SOCIAL_PRIVACY_MODE` | `off` / `session` / `global` | `session` |

### HTTP endpoints

The server exposes a few operational endpoints (bound to
`OPENZIGS_SOCIAL_SERVER_HOST:PORT`):

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness — `200` with `{ status, uptimeMs }`. |
| `GET /ready` | Readiness — `200`/`503` with per-dependency `checks`. |
| `GET /api/metrics` | Per-platform counters as a flat JSON envelope. |
| `POST /api/setup/validate-key` | Validate + store a BYOK provider key. |
| `POST /api/setup/telegram/verify` | Verify + store a Telegram bot connection. |
| `GET /api/setup/status` | First-run setup completion status. |

`GET /api/metrics` returns JSON (not Prometheus plain-text):

```json
{
  "timestamp": "2026-05-29T00:00:00.000Z",
  "metrics": {
    "twitter": { "sent": 3, "received": 12, "failed": 0 }
  }
}
```

The same `metrics` snapshot is pushed to connected UIs over Socket.IO as a
`metrics:update` event whenever a counter changes.

## 11. Troubleshooting

### "Ollama unreachable" warning on launch

The wrapper probes `http://localhost:11434/api/tags`. If Ollama isn't
running, the app falls back to whichever BYOK provider you have
configured. Start Ollama (`ollama serve`) and either install a Gemma 4
variant manually (`ollama pull gemma4:e2b`) or accept the in-app prompt
on next launch.

### A platform connector says "needs reconsent"

Your OAuth refresh token has hard-expired. Open the affected platform
panel and walk through the re-auth flow; the vault entry is updated
atomically on success.


## 2–10. _To be written._
