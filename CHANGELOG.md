# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial repository scaffold (Node 22 + TypeScript ESM + pnpm workspace, Next.js 14 UI shell, Vitest, ESLint, Prettier, CI / CodeQL / Gitleaks / graphify workflows, issue + PR templates).
- **Foundation epic #28**: Copilot SDK wrapper, BYOK providers, Ollama + Gemma 4, smart router, privacy mode, credential vault.
  - Bumped `@github/copilot-sdk` to `^0.3.0` and audited 0.2→0.3 breaking changes (#130).
  - `src/copilot/providers/`: `Provider` abstraction with `Copilot`, `OpenAI`, `Anthropic`, `OpenAI-compatible`, and `Ollama` (Gemma 4 with RAM-based variant auto-detect) implementations (#30, #31).
  - `src/copilot/session-manager.ts`: per-session token tracking, `session.tokens.update` event stream (#29).
  - `src/copilot/smart-router.ts`: `cloudThresholdTokens` (default 4096) routing with `chars/4` token estimator (#32).
  - `src/copilot/privacy.ts`: `off | session | global` privacy mode kill-switch; `global` blocks cloud-provider construction (#33).
  - `src/copilot/wrapper.ts`: `CopilotWrapper` facade composing all of the above.
  - `src/vault/`: AES-256-GCM envelope-encrypted credential vault at `~/.openzigs-social/auth.json` (mode `0o600`, parent dir `0o700`) (#34).
  - `src/vault/refresh-scheduler.ts`: OAuth token refresh scheduler skeleton with per-provider `RefreshRegistry`, `token:refreshed` / `token:expired` events; Telegram alert path stubbed pending epic #47 (#131).
  - Added `node-cron` dependency for scheduler hosting.
  - Raised Vitest coverage thresholds from 0 → 80 on lines / functions / branches / statements.

### Security
- Bump `next` to `^14.2.35` and pin `uuid` `>=11.1.1` via pnpm override to patch GHSA-f82v-jwr5-mffw (Auth Bypass in Next.js Middleware, critical) and 8 high-severity Next.js advisories.
- Add pnpm override `glob: ">=10.5.0"` to patch GHSA-5j98-mcp5-4vw2 (glob CLI command injection, high) in transitive deps.

