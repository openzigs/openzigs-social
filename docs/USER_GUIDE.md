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
