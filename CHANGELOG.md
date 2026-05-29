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
- **Foundation epic #35**: HTTP server + Socket.IO + sessions + logging + audit log + config layering.
  - `docs/adr/0001-process-topology.md`: ADR recording the v1 single-Node-process-as-Tauri-sidecar topology and the `resolveDataDir()` / `OPENZIGS_SOCIAL_HOME` data-directory strategy (#134).
  - `src/config/paths.ts`: centralised data-directory resolution (`resolveDataDir`, `logsDir`, `auditDir`, `sessionsDir`, `dbPath`, `vaultPath`, `userConfigPath`) honouring the `OPENZIGS_SOCIAL_HOME` override (#134); `src/vault/vault.ts` now derives its path from this helper.
  - `src/config/`: Zod-validated config with `default.json` → `user.json` → environment-variable layering (`loadConfig` / `getConfig` / `resetConfig`) (#37).
  - `src/logging/`: Winston JSON logger (stdout + optional rotating file), recursive secret redaction, and an append-only JSONL `AuditLogger` (`auth`/`publish`/`inbound`/`config`/`vault`/`oauth` categories, `0o600`) (#38).
  - `src/db/migrator.ts`: versioned SQL migrations runner with a `schema_migrations` ledger and per-migration transactions; `migrations/0001-init.sql` baseline (#133).
  - `src/db/index.ts`: better-sqlite3 bootstrap with WAL, `foreign_keys=ON`, `busy_timeout`, in-memory support, and migration-on-open (#40).
  - `src/server/app.ts` + `src/server/socket.ts` + `src/server/index.ts`: Express 5 app with `helmet`, `GET /health`, `GET /ready`, `GET /api/metrics`, and a CORS-locked Socket.IO server with client-id session restoration (#36, #132).
  - `src/sessions/transcript-manager.ts`: JSONL transcript ledger with `.meta.json` sidecars, path-traversal-guarded session ids, and create/list/load/append/rename/delete (#39).
  - `src/server/metrics.ts`: per-platform sent/received/failed counters emitting `update` events, broadcast over Socket.IO (#132).
  - Added `pnpm.onlyBuiltDependencies` for `better-sqlite3` so its native binding compiles on install (incl. CI).

### Security
- Bump `next` to `^14.2.35` and pin `uuid` `>=11.1.1` via pnpm override to patch GHSA-f82v-jwr5-mffw (Auth Bypass in Next.js Middleware, critical) and 8 high-severity Next.js advisories.
- Add pnpm override `glob: ">=10.5.0"` to patch GHSA-5j98-mcp5-4vw2 (glob CLI command injection, high) in transitive deps.

