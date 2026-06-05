# openzigs-social

> Focused, agentic, local-first social media manager.

![CI](https://github.com/openzigs/openzigs-social/actions/workflows/ci.yml/badge.svg)
![CodeQL](https://github.com/openzigs/openzigs-social/actions/workflows/codeql.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
![pnpm](https://img.shields.io/badge/pnpm-10-orange)

<!-- hero: screenshot of the unified inbox with dark mode -->

A streamlined OSS companion to [openzigs](https://github.com/openzigs/openzigs) — built around the **Social Brain** alone. Unified inbox, AI-assisted replies in your brand voice, smart scheduling, light CRM, and full remote control from Telegram — running entirely on your own machine.

## Why

Commercial social tools charge per seat, lock the inbox behind premium tiers, and run all inference in their cloud. openzigs-social ships the inbox, the AI auto-reply, and the analytics in the free, open tier — and keeps your messages on your laptop.

No subscription. No per-seat pricing. No prompt data leaving your machine unless you choose a cloud AI provider.

## Supported platforms (v1)

| Platform | Publish | Inbox (comments) | Inbox (DMs) | Analytics |
|---|---|---|---|---|
| Twitter / X | ✅ | ✅ (polling) | ✅ Basic+ tier | ✅ |
| Instagram | ✅ | ✅ | ✅ | ✅ |
| Facebook Pages | ✅ | ✅ | ✅ | ✅ |
| Threads | ✅ | ✅ | — | ✅ |
| LinkedIn | ✅ | ✅ | — (Compliance Partner required) | ✅ |
| YouTube | ✅ | ✅ | — | ✅ |
| Pinterest | ✅ | — | — | ✅ |
| TikTok | ✅ (private until audited) | — | — | ✅ |

> Threads requires a Meta developer app. Reddit is planned for v1.1.

## Feature highlights

- **Unified inbox + DM relay** — every platform's DMs and comments in one prioritised list; send replies from Telegram with `/dm instagram @alice …`
- **AI auto-reply with brand voice** — confidence threshold + voice-match gate; banned-word hard veto; append-only audit log; full human-in-the-loop control
- **Content calendar + outbox + retry/DLQ** — drag-to-reschedule; `1m → 5m → 30m → 2h` exponential backoff; dead-letter queue for failed posts
- **Light CRM** — contacts, lead scoring, conversation history, one-click merge, GDPR right-to-delete (single-transaction cascade + receipt)
- **Analytics dashboard** — engagement metrics, top posts, posting-time heatmap, weekly digest over Telegram + email
- **Onboarding wizard** — Gemma 4 auto-install, per-platform OAuth, Meta app walkthrough, starter recipe picker, tour overlays
- **Full Telegram remote control** — approve/reject/pause from your phone; deny-by-default ACL
- **Privacy mode** — local-only kill switch (`global`) forces all LLM traffic through Ollama; cloud providers refuse to construct

## Quick start

```bash
git clone https://github.com/openzigs/openzigs-social.git
cd openzigs-social
pnpm install
cp config/default.json config/local.json   # edit as needed
pnpm dev                  # API server on :3000
cd ui && pnpm dev         # Next.js UI on :3001
```

Open `http://localhost:3001`. The setup wizard at `/setup` connects your AI provider and Telegram bot; the onboarding tab at `/onboarding` walks through platform OAuth.

> **Gemma 4 via Ollama is the default LLM.** Install [Ollama ≥ 0.30.5](https://ollama.com/download) and run `ollama pull gemma4:e4b` (or let the onboarding wizard pull the right variant for your machine's RAM — `gemma4:12b` for ≥ 16 GiB, `gemma4:e4b` for 8–16 GiB, `gemma4:e2b` for < 8 GiB).

## Configuration

Copy `config/default.json` to `config/local.json` and edit as needed. See [docs/USER_GUIDE.md §2](docs/USER_GUIDE.md#2-first-run-setup-wizard) for the full setup walkthrough and §13 for the environment variable reference.

## Architecture

A single Node 22 process (Express 5 + Socket.IO + better-sqlite3 + grammy) backed by SQLite, with a Next.js 16.2 App Router UI on a separate port. Default LLM is Gemma 4 via Ollama with a smart router for cloud fallback. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev loop (prerequisites, clone, config, run, quality gate, branch conventions, and graphify knowledge graph usage).

## License

MIT — see [LICENSE.md](LICENSE.md).
