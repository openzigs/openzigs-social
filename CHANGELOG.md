# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security
- Hardened the setup-wizard SSRF guard (`src/server/setup/ssrf.ts`) used by `POST /api/setup/validate-key` for user-supplied OpenAI-compatible base URLs: alternate IPv4 encodings (decimal `2130706433`, hex `0x7f000001`, octal `017700000001`, short `127.1`) are now canonicalized to dotted-quad before range checks; IPv4-mapped IPv6 literals (`[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`) are decoded and re-checked; and the CGNAT range (100.64.0.0/10) is blocked alongside loopback/private/link-local/metadata. The provider validator (`src/server/setup/provider-validator.ts`) now sets `redirect: "manual"` so a hostile endpoint cannot 3xx-redirect the validation request to an internal host — redirects are treated as a validation failure. DNS-rebinding (TOCTOU) remains out of scope, deferred to #47/#100.

### Added
- **Telegram remote-control channel epic #47** (`src/channels/telegram/`): the bot is openzigs-social's only push-notification + remote-control surface. Opt-in via `telegram.enabled` (default `false`); bot token + primary admin chat id come from the encrypted vault, never config or logs.
  - `src/channels/telegram/telegram-channel.ts`: `TelegramChannel` owns an injected grammy `Bot`, runs long-polling, and wires the ACL → `@grammyjs/menu` queue menu → commands → approval callbacks in a single idempotent `register()` (#48). The bot is injected so tests intercept all API calls via a transformer — no network is ever required.
  - Inline approval flow (#50): subscribes to the shared `ApprovalQueue` `request` event and pushes an Approve/Reject inline keyboard to every admin chat; button taps settle the awaiting approval via `ApprovalQueue.decide(id, "approve"|"reject")`. Decision/timeout events edit the pushed message to show ✅/❌/⌛. There is exactly **one** approval system — this is only the Telegram rendering layer on top of #128's queue. Callback data is a compact, defensively-parsed `oz:appr:<decision>:<id>` (well under Telegram's 64-byte limit).
  - DM relay (#51): `/dm <platform> <recipient> <message>` relays a direct message "as the user" through the new `SocialDmSender` port (`src/channels/social/dm-sender.ts`). The concrete adapters are owned by the platform-service epic (#127); until then the relay degrades cleanly to "unavailable" — there are **no fake network calls**.
  - Admin-chat ACL + commands (#52): deny-by-default `AdminAcl` middleware runs first and silently drops any non-admin update (no existence leak). Commands `/start`, `/status`, `/privacy`, and `/queue` (lists pending approvals via the menu) are reachable only by allow-listed admin chats.
  - Config: new non-secret `telegram` block (`enabled`, `mode`, `approvalTimeoutMs`, `adminChatIds`) in `src/config/schema.ts` / `config/default.json`, with `OPENZIGS_SOCIAL_TELEGRAM_ENABLED` / `_MODE` env overrides. Wired into `startServer` guarded on `telegram.enabled`, wrapped in try/catch so it never blocks server start. See `docs/TELEGRAM_SETUP.md`.
- **Approval queue + handoff primitives epic #128** (cross-cutting backend primitives, no UI): in-memory, framework-agnostic building blocks consumed later by Telegram (#47), the inbox (#71), auto-reply (#78), the outbox (#84), and the DM dispatcher.
  - `src/approvals/approval-queue.ts`: `ApprovalQueue` — an EventEmitter-based, awaitable-Promise primitive. `request(payload, { timeoutMs })` returns a Promise that **always resolves** (never rejects); a timeout resolves with `{ decision: "timeout" }` so callers fall back gracefully. `decide(id, decision, metadata?)` settles the awaiting Promise and is idempotent/race-safe (a decision after timeout or a double-decision is a no-op). Emits `request` / `decision` / `timeout` events; `list()` exposes pending requests for snapshot/restoration; timers are cleared on settle (no leaks). Inputs validated with Zod at the boundary (#49).
  - `src/handoff/handoff-manager.ts`: `HandoffManager` — `register(threadId, controller?)` wires an `AbortController` into in-flight draft generation; `takeOver(threadId)` synchronously aborts every registered controller (well within the 2s budget) and marks the thread human-owned, emitting `ownership.change`. `release(threadId)` returns ownership to AI; `isHumanOwned` / `owner` / `list` query state. Registering a draft on an already human-owned thread aborts it immediately (#75).
  - State is **in-memory by default** — pending approvals and ownership are not persisted here; consuming surfaces (#47/#71) restore their own context and re-issue requests on restart. `list()` is provided for snapshotting.
  - Robustness hardening (follow-up): `ApprovalQueue` accepts an optional `maxPending` cap — when set, a `request()` that would exceed it throws `ApprovalQueueFullError` synchronously (fail-fast backpressure, no dangling promise); default remains unbounded. `HandoffManager` now self-heals: `register()` attaches an `abort` listener so a controller aborted for any reason other than `takeOver` (e.g. normal completion) is auto-pruned even if the consumer forgets `unregister()` — without emitting a spurious `ownership.change`; `takeOver` still emits exactly one event.
- **Setup wizard epic #129** (minimal skeleton): first-run multi-step wizard to connect an AI provider and a Telegram bot.
  - `ui/app/setup/page.tsx` + `ui/components/setup/`: 3-step React wizard (Welcome → AI provider → Telegram) with an accessible step indicator and progress persisted across refreshes via `localStorage` (`useSyncExternalStore`); only progress flags are persisted — never secrets (#101).
  - `src/server/setup/provider-validator.ts` + `POST /api/setup/validate-key`: BYOK key entry for OpenAI / Anthropic / OpenAI-compatible, validated server-side against the provider's lightweight `/models` endpoint (key never leaves the local server) and stored encrypted in the vault (`0o600`); OpenAI-compatible base URLs are SSRF-guarded via `src/server/setup/ssrf.ts` (#103).
  - `src/server/setup/telegram-verify.ts` + `POST /api/setup/telegram/verify`: Telegram bot connection (bot token + admin chat id) verified via `getMe`, followed by a one-time test message to the admin chat; token + chat id stored in the vault (#104).
  - `GET /api/setup/status`: reports `{ complete, hasProvider, hasTelegram }`.
  - Telegram support here is a minimal verification skeleton — full Telegram integration lands in epic #47, and the polished onboarding experience remains tracked in #100.
- **UI shell epic #41**: Next.js 16.2 App Router shell with shadcn/Radix primitives, top navigation, dark mode, dashboard, and client data providers.
  - shadcn primitives (`button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `tabs`, `toast` + `use-toast`/`toaster`) on Radix UI with Tailwind v4 CSS-first theming (#42).
  - `components/top-nav.tsx`: primary top navigation with route links (Inbox, Compose, Calendar, Analytics, Contacts, Settings), active-route `aria-current`, and an accessible brand link (#43).
  - `components/theme-provider.tsx` + `components/theme-toggle.tsx`: system/light/dark theme toggle with `localStorage` persistence, no-FOUC init script, and React View Transitions–animated theme switches via `document.startViewTransition` (#44).
  - `app/page.tsx`: empty dashboard page with a KPI card layout shell and quick-actions dialog (#45).
  - `app/providers.tsx`: React Query (`@tanstack/react-query`) provider plus a Socket.IO client that restores the persisted `clientId` from `localStorage` and re-persists the server-assigned session id on `session:restored` (#46).
  - UI test harness: Vitest + Testing Library + jsdom with ESLint 9 flat config (`eslint-config-next` core-web-vitals + typescript) replacing the removed `next lint`.
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

### Fixed
- REST API now sends CORS headers scoped to the configured `server.uiOrigin`, so the browser UI (Next.js dev server on a different port) can reach the setup-wizard endpoints (`POST /api/setup/validate-key`, `POST /api/setup/telegram/verify`, `GET /api/setup/status`); previously cross-origin preflight was blocked with a missing `Access-Control-Allow-Origin` header. Hand-rolled middleware (no new dependency), single-origin only — no wildcard or arbitrary-origin reflection — matching the Socket.IO CORS posture (no credentials).
- Added `ui/app/icon.svg` so the app serves a favicon, eliminating the `favicon.ico` 404 on every page.

### Security
- Upgrade the `ui/` package from Next.js 14.2.35 to **16.2** (with `react`/`react-dom` pinned to identical `19.2.x`), clearing the residual high-severity Next.js advisories that required Next 15+ (content-injection / SSRF, cache-key confusion, image-optimization DoS, and middleware redirect / i18n bypass). `pnpm audit` in `ui/` now reports no high or critical findings.
- Value-level secret scrubbing in the logging pipeline: free-form string values (including the Winston `message` field) are now scanned for `Bearer <token>` and `sk-…` OpenAI-style keys and masked, complementing the existing key-name redaction (`src/logging/redact.ts`).
- Bump `next` to `^14.2.35` and pin `uuid` `>=11.1.1` via pnpm override to patch GHSA-f82v-jwr5-mffw (Auth Bypass in Next.js Middleware, critical) and 8 high-severity Next.js advisories.
- Add pnpm override `glob: ">=10.5.0"` to patch GHSA-5j98-mcp5-4vw2 (glob CLI command injection, high) in transitive deps.

