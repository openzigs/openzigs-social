# Architecture

> Living document. Updated by the Code Issue agent as foundation epics land.

## Table of contents

1. Overview
2. Tech stack
3. Process topology
4. Module map (`src/`)
5. UI map (`ui/`)
6. Data model (SQLite)
7. Copilot SDK runtime + smart router + privacy mode
8. Platform connectors
9. Approval queue + Telegram remote-control flow
10. Brand voice + AI auto-reply pipeline
11. Setup wizard
12. Packaging (Tauri + docker-compose)
13. Security model
14. Observability (Winston + audit log)

## 1. Overview

_To be written._

## 2. Tech stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node | 22 |
| Package manager | pnpm | 10 |
| Server framework | Express | 5 |
| Realtime | Socket.IO | 4.8 |
| Database | better-sqlite3 (WAL) | 12 |
| Logging | Winston | 3 |
| Hardening | helmet | 7 |
| Agent runtime | @github/copilot-sdk | ^0.3.0 |
| Default local LLM | Ollama / Gemma 4 | — |
| Telegram channel | grammy + @grammyjs/menu | 1.40 |
| UI framework | Next.js (App Router) | 14.2 |
| UI library | React | 19 |
| Styling | Tailwind CSS | 4.3 |
| UI primitives | Radix UI / shadcn | latest |
| Data fetching | TanStack Query | 5 |
| Schema validation | zod | 3.25 |
| Test runner | vitest | 2.1 |
| Desktop shell | Tauri | latest |

## 3. Process topology

v1 ships as a **single Node process** launched as a Tauri-managed sidecar.
The full rationale, alternatives (N-API in-process, separate daemon), and
consequences live in [docs/adr/0001-process-topology.md](adr/0001-process-topology.md).

All on-disk state lives under one data directory resolved by
`resolveDataDir()` (`src/config/paths.ts`):

* Default: `~/.openzigs-social/`
* Override: the `OPENZIGS_SOCIAL_HOME` environment variable (used by the
  sandboxed macOS bundle, which points at
  `$HOME/Library/Application Support/social.openzigs.app/`, and by tests,
  which point at a `os.tmpdir()` scratch directory).

Layout under the data directory:

| Path | Contents |
|---|---|
| `openzigs-social.db` | SQLite database (WAL) |
| `auth.json` | Encrypted credential vault (`0o600`) |
| `user.json` | User config overlay |
| `logs/` | Rotating Winston log files |
| `audit/audit.jsonl` | Append-only audit log |
| `sessions/` | Per-session transcript JSONL + `.meta.json` sidecars |

## 4. Module map (`src/`)

| Module | Responsibility |
|---|---|
| `config/paths.ts` | Data-directory + file-path resolution (`OPENZIGS_SOCIAL_HOME` aware) |
| `config/schema.ts` + `config/index.ts` | Zod schema + `default.json` → `user.json` → env layering |
| `logging/logger.ts` | Winston JSON logger (stdout + optional rotating file) |
| `logging/redact.ts` | Recursive secret redaction for log payloads |
| `logging/audit-logger.ts` | Append-only JSONL audit log |
| `db/migrator.ts` | Versioned SQL migrations runner (`schema_migrations` ledger) |
| `db/index.ts` | better-sqlite3 bootstrap (WAL, pragmas, migrate-on-open) |
| `sessions/transcript-manager.ts` | JSONL transcript ledger + metadata sidecars |
| `server/app.ts` | Express 5 app, helmet, health/ready/metrics routes |
| `server/socket.ts` | CORS-locked Socket.IO server, client-id session restoration |
| `server/metrics.ts` | Per-platform sent/received/failed counters |
| `server/index.ts` | Composition root: wires config/logger/db/sessions/server |
| `copilot/` | Copilot SDK wrapper, providers, smart router, privacy (epic #28) |
| `vault/` | Encrypted credential vault + OAuth refresh scheduler (epic #28) |

## 5. UI map (`ui/`)

_To be written._

## 6. Data model (SQLite)

The database lives at `<dataDir>/openzigs-social.db` and is opened in WAL
mode with `foreign_keys=ON` and a 5 s `busy_timeout` (`src/db/index.ts`).
Schema changes are applied **only** through the migrations runner
(`src/db/migrator.ts`): every `migrations/NNNN-name.sql` file runs once,
inside its own transaction, and is recorded in the `schema_migrations`
ledger (`version INTEGER PRIMARY KEY`, `applied_at`). Migration files are
immutable once shipped. The `0001-init.sql` baseline creates a `meta`
key/value table; feature tables are added by later epics.

## 7. Copilot SDK runtime + smart router + privacy mode

All LLM traffic flows through `CopilotWrapper` (`src/copilot/wrapper.ts`),
which composes four collaborators:

1. **Providers** (`src/copilot/providers/`) — `Provider` interface with
   concrete implementations for Copilot (via `@github/copilot-sdk` v0.3),
   OpenAI, Anthropic, any OpenAI-compatible endpoint (Groq, Together,
   OpenRouter, etc.), and Ollama. The factory in `factory.ts` is the only
   place callers should construct providers.

2. **Smart router** (`smart-router.ts`) — estimates tokens with
   `Math.ceil(chars / 4)`, routes to the local provider when the estimate
   is ≤ `cloudThresholdTokens` (default `4096`) or whenever the privacy
   controller forces local. Falls through to local when no cloud provider
   is configured.

3. **Privacy controller** (`privacy.ts`) — three modes:
   * `off` — smart router free to use cloud
   * `session` — current process force-routes everything to local
   * `global` — persistent kill-switch; constructing a cloud provider is
     a hard error (defence in depth)

4. **Session manager** (`session-manager.ts`) — owns per-session message
   history and a running token counter. Emits `session.tokens.update`
   after every chunk so Socket.IO and persistence layers can stream.

### Ollama / Gemma 4 default

`createOllamaProvider()` defaults to Gemma 4. `pickGemma4Variant(totalmem)`
picks by host RAM (`e2b` < 8 GiB, `e4b` 8–16 GiB, `e8b` ≥ 16 GiB).
`probeOllama()` hits `/api/tags` and `pickInstalledGemma4()` prefers the
largest installed variant (`e8b` > `e4b` > `e2b`).

### Copilot SDK v0.2 → v0.3 migration (issue #130)

We pinned `@github/copilot-sdk` at `^0.3.0`. Breaking changes that touch
our wrapper surface:

| Area | 0.2 | 0.3 | Our action |
|---|---|---|---|
| `createSession` | `onPermissionRequest` optional | required | Pass `approveAll` from the SDK — our wrapper is a single-tenant runtime so blanket approval is correct. |
| MCP config types | `MCPLocalServerConfig` / `MCPRemoteServerConfig` | renamed to `MCPStdioServerConfig` / `MCPHTTPServerConfig` | Not referenced by our code. |
| Filesystem hook | `SessionFsHandler` | `SessionFsProvider` (+ `createSessionFsAdapter`) | Not referenced by our code. |
| New exports | — | `ProviderConfig`, `DefaultAgentConfig`, `convertMcpCallToolResult` | Noted; unused. |

Session, streaming, and tool-call surfaces (`CopilotSession.on(...)`,
`session.sendAndWait(...)`, `session.disconnect()`) are unchanged.

## 13. Security model

### Credential vault (`src/vault/`)

* File: `~/.openzigs-social/auth.json`, mode `0o600`
* Parent dir: `0o700`
* Envelope encryption: AES-256-GCM, key derived via scrypt
* Default key material: machine-stable identifier (host + user + platform).
  Production deployments should inject a user-supplied passphrase via
  `CredentialVault({ keyMaterial })`.
* Writes are atomic (tmpfile + chmod + rename).
* The vault holds two record types:
  * `providers[name]` — `{ apiKey?, baseUrl?, model? }`
  * `oauth[platform]` — `{ accessToken, refreshToken?, expiresAt?, needsReconsent? }`
* `toString()` returns a redacted summary (keys only) — secrets are never
  logged.

### OAuth token refresh scheduler (#131)

`TokenRefreshScheduler` ticks the vault on a cadence (caller-driven; the
production wiring uses `node-cron`). For every credential with an
`expiresAt` inside the refresh window (default 24 h) the scheduler looks
up a `RefreshHandler` in `RefreshRegistry` and attempts an atomic
replacement. Hard failures mark the credential `needsReconsent: true` and
emit a `token:expired` event. The Telegram alert path is the event sink
plus structured log — the real `sendMessage` call is wired by epic #47.

### HTTP hardening

The Express app (`src/server/app.ts`) applies `helmet()`, disables the
`x-powered-by` header, and caps JSON bodies at 1 MB. The Socket.IO server
(`src/server/socket.ts`) locks CORS to the configured `server.uiOrigin`.

## 14. Observability (Winston + audit log)

### Structured logging

`createLogger()` (`src/logging/logger.ts`) builds a Winston logger that
emits JSON to stdout and, when `logging.toFile` is set, to a rotating file
under `<dataDir>/logs/`. A redaction format (`src/logging/redact.ts`)
recursively strips sensitive keys (`apiKey`, `accessToken`,
`refreshToken`, `password`, `secret`, `authorization`, `private_key`, …)
before anything is written, replacing values with `[REDACTED]` and
guarding against circular references.

### Audit log

`AuditLogger` (`src/logging/audit-logger.ts`) appends one JSON object per
line to `<dataDir>/audit/audit.jsonl` (`0o600`). Each entry is
categorised (`auth`, `publish`, `inbound`, `config`, `vault`, `oauth`),
timestamped, and has its `details` redacted. Writes are serialised through
a promise chain so concurrent callers cannot interleave partial lines.

### Health, readiness, and metrics endpoints

* `GET /health` — liveness; returns `200` with `uptimeMs`.
* `GET /ready` — readiness; returns `200`/`503` with a per-dependency
  report (`db`, `config`, `vault`).
* `GET /api/metrics` — current per-platform counters (`sent`, `received`,
  `failed`). The same snapshot is broadcast over Socket.IO as
  `metrics:update` whenever a counter changes (`src/server/metrics.ts`).

