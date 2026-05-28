# openzigs-social

> Focused, agentic, local-first social media manager.

A streamlined OSS companion to [openzigs](https://github.com/openzigs/openzigs) — built around the **Social Brain** alone. Unified inbox, AI-assisted replies in your brand voice, smart scheduling, light CRM, and full remote control from Telegram — running entirely on your own machine.

## Why

Commercial social tools charge per seat, lock the inbox behind premium tiers, and run all inference in their cloud. openzigs-social ships the inbox, the AI auto-reply, and the analytics in the free, open tier — and keeps your messages on your laptop.

## Supported platforms (v1)

- Twitter / X (BYOK)
- LinkedIn
- Instagram (Business / Creator)
- Facebook (Pages)
- YouTube
- TikTok
- Pinterest

*Threads and Reddit are planned for v1.1.*

## Local-first

- Default LLM is **Gemma 4** via [Ollama](https://ollama.ai/) — variant auto-selected for your RAM.
- BYOK supported for OpenAI, Anthropic, and any OpenAI-compatible endpoint.
- Smart router sends short prompts local, long prompts to your chosen provider. A privacy-mode kill switch forces local-only.
- Credentials live in `~/.openzigs-social/auth.json` (0o600). No telemetry. No remote control plane.

## Status

Pre-alpha. Tracked work lives in the [GitHub epics](https://github.com/openzigs/openzigs-social/issues?q=is%3Aissue+label%3Aepic).

## License

MIT — see [LICENSE.md](LICENSE.md).
