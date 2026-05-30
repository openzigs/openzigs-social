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

(See § 12.1 Telegram remote-control channel and § 12.2 Platform service layer.)

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
| UI framework | Next.js (App Router) | 16.2 |
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
| `approvals/approval-queue.ts` | `ApprovalQueue` — awaitable-Promise + EventEmitter approval primitive (epic #128) |
| `handoff/handoff-manager.ts` | `HandoffManager` — per-thread AI↔human ownership + draft cancellation (epic #128) |
| `channels/telegram/` | Telegram remote-control channel: grammy bot, inline approval keyboards, `/queue` menu, DM relay, admin ACL (epic #47) |
| `channels/social/dm-sender.ts` | `SocialDmSender` port — outbound DM contract implemented by the platform service (#127) |
| `platform/oauth/` | OAuth handshake: CSRF state store, connector registry, callback router (#139) |
| `platform/webhooks/` | Inbound webhooks: HMAC verify, dedupe ledger, handler registry, router (#140) |
| `platform/rate-limit/` | Token bucket + per-platform broker with quotas/warnings (#141) |
| `platform/retry/` | Exponential backoff, retry, dead-letter queue (#142) |
| `platform/social-brain/` | Idempotent inbound persistence (contacts/threads/messages) (#143) |
| `platform/dm/` | `SocialDmSenderRegistry` (the #51 port) + rule-chain `DmDispatcher` (#144) |
| `connectors/meta/` | Cohort A connectors: Instagram + Facebook Pages + Threads via Meta Graph API `v25.0`, built on the #127 ports (epic #53) |
| `connectors/{linkedin,pinterest,tiktok}/` | Cohort B connectors: LinkedIn (no DM) + Pinterest + TikTok (PRIVATE-only), built on the #127 ports (epic #60) |
| `connectors/twitter/` | Cohort C connector: X (Twitter) v2 with per-tier write-quota tracking + DM gated to paid tiers, built on the #127 ports (epic #66) |
| `inbox/rules/` | Declarative comment **rule engine** — no-`eval` condition AST evaluator, repository, and append-only firing audit trail (epic #71, #74) |
| `inbox/repository.ts` + `inbox/platform-limits.ts` | Unified thread/message read model (priority+recency sort, unread counts, FTS5 search) and per-platform reply limits (LinkedIn comments-only) (epic #71, #76/#77) |
| `server/inbox/router.ts` | `/api/inbox/*` — threads, thread detail, mark-read, reply (via the #144 DM dispatcher), rules CRUD, firings, platform-limits; consumes the #143 SocialBrain store (epic #71) |
| `server/connections/router.ts` | `GET /api/connections` — per-platform connect/needs-reconsent status (never echoes tokens) (#53) |

## 5. UI map (`ui/`)

The desktop UI is a **Next.js 16.2** App Router app (`ui/`) styled with
Tailwind v4 (CSS-first `@theme`) and built from Radix UI / shadcn primitives.
It runs on port `3001` in development and talks to the Node server (port
`3000`) over REST + Socket.IO.

| Path | Responsibility |
|---|---|
| `app/layout.tsx` | Root layout; injects the no-FOUC theme script and wraps the tree in `Providers` + `TopNav` |
| `app/providers.tsx` | Client providers: TanStack Query, `ThemeProvider`, the Socket.IO client, and the toast `Toaster`; exposes `useSocket()` |
| `app/page.tsx` | Dashboard shell — KPI card grid + quick-actions dialog |
| `app/{compose,calendar,analytics,contacts,settings}/page.tsx` | Route placeholders for the primary nav destinations |
| `app/inbox/page.tsx` + `components/inbox/` | Unified inbox: filter bar + full-text search, live thread list (badges/unread/priority), thread detail with DM/Comments tabs + reply composer; LinkedIn DM section hidden (epic #71, #76/#77) |
| `lib/inbox.ts` | Inbox client: thread/reply fetchers, per-platform limits mirror, and React Query hooks subscribed to `inbox:*` socket events (epic #71) |
| `app/compose/page.tsx` | Composer: per-account publish-target picker + post body (epic #53) |
| `components/compose/publish-targets.tsx` | Publish-target checkbox list driven by `GET /api/connections` (#53) |
| `lib/connections.ts` | `fetchConnections()` client for `GET /api/connections` (#53) |
| `components/top-nav.tsx` | Primary top navigation (active-route `aria-current`) + theme toggle |
| `components/theme-provider.tsx` | Theme context backed by `useSyncExternalStore`; `localStorage` persistence + system-scheme tracking |
| `components/theme-toggle.tsx` | System/light/dark dropdown toggle |
| `components/kpi-card.tsx` / `components/dashboard-dialog.tsx` | Dashboard building blocks |
| `components/ui/` | shadcn primitives (button, card, dialog, dropdown-menu, input, label, tabs, toast) |
| `lib/theme.ts` | Theme resolution + DOM application via `document.startViewTransition` (React 19.2 View Transitions) |
| `lib/socket.ts` | `createSocket()` — Socket.IO client sending the persisted `clientId` in the handshake auth; persists the server-assigned session id on `session:restored` |
| `lib/client-id.ts` | Stable client id generation/persistence (`localStorage`, UUID v4) |
| `lib/query-client.ts` | TanStack Query client factory |
| `lib/nav.ts` | Declarative nav route table + active-route helper |

The client-id contract mirrors the server: on connect the socket sends
`auth.clientId` (restored from `localStorage`), and the server replies with
`session:restored` carrying the canonical `sessionId`, which the client
persists back to `localStorage` so sessions survive reloads.

## 6. Data model (SQLite)

The database lives at `<dataDir>/openzigs-social.db` and is opened in WAL
mode with `foreign_keys=ON` and a 5 s `busy_timeout` (`src/db/index.ts`).
Schema changes are applied **only** through the migrations runner
(`src/db/migrator.ts`): every `migrations/NNNN-name.sql` file runs once,
inside its own transaction, and is recorded in the `schema_migrations`
ledger (`version INTEGER PRIMARY KEY`, `applied_at`). Migration files are
immutable once shipped. The `0001-init.sql` baseline creates a `meta`
key/value table; feature tables are added by later epics.

`0002-platform-service.sql` (epic #127) adds the persistence the connector
epics, the inbox, the auto-reply pipeline, the outbox, and the DM dispatcher
share:

| Table | Purpose |
|---|---|
| `social_contacts` | Inbound contacts, idempotent on `UNIQUE (platform, platform_contact_id)` |
| `social_threads` | Conversation threads, `UNIQUE (platform, platform_thread_id)`, FK → `social_contacts` |
| `social_messages` | Inbound/outbound messages, `UNIQUE (platform, platform_message_id)`, FK → thread + contact |
| `webhook_events` | Dedupe ledger, `UNIQUE (platform, event_id)` so replays are no-ops |
| `outbox_dlq` | Dead-letter queue for terminally-failed outbound ops (#142) |

`0003-meta-insights.sql` (epic #53) adds `platform_insights_raw` — raw
per-object metric snapshots (`UNIQUE (platform, object_id, metric, captured_for)`)
written by the Facebook/Threads insights pollers via `InsightsRepository`.

`0005-inbox-rule-engine.sql` (epic #71) adds the inbox read/rule tables on top
of the #127 SocialBrain store:

| Table | Purpose |
|---|---|
| `inbox_rules` | Declarative rule definitions (condition AST + actions JSON, enabled flag) |
| `inbox_rule_firings` | **Append-only** audit trail of every rule that fired against a message (FK → `inbox_rules`, **ON DELETE SET NULL** — firings are retained when a rule is deleted; migration `0006`) |
| `inbox_thread_state` | Per-thread derived state — priority, flagged, `last_read_at` (PK/FK → `social_threads`, CASCADE) |
| `social_messages_fts` | SQLite **FTS5** external-content index over `social_messages.body`, kept in sync by insert/update/delete triggers, powering inbox full-text search |

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

## 12. Approval queue + handoff primitives (#128)

Two small, in-memory, framework-agnostic primitives shared by every surface
that needs human-in-the-loop control. They have no UI of their own and no DB
layer — consuming surfaces (#47 Telegram, #71 inbox, #78 auto-reply, #84
outbox, the DM dispatcher) restore their own context and re-issue requests on
restart. Both expose `list()` for snapshotting.

### `ApprovalQueue` (`src/approvals/approval-queue.ts`, #49)

EventEmitter-based, awaitable primitive:

* `request(payload, { timeoutMs?, id? }): Promise<ApprovalOutcome>` — **always
  resolves, never rejects**. On timeout it resolves `{ decision: "timeout" }`
  so callers can fall back gracefully.
* `decide(id, "approve" | "reject", metadata?): boolean` — settles the awaiting
  Promise. Idempotent and race-safe: a decision after timeout or a second
  decision is a no-op (`false`), never a double-settle or throw.
* `list()` / `get(id)` / `has(id)` / `size` — inspect pending requests.
* `clear()` — settle all pending as timeouts (shutdown).
* Emits `request`, `decision`, `timeout`. Timers are cleared on settle and
  decided/timed-out entries removed from the pending map (no leaks). Inputs
  are Zod-validated at the boundary.

### `HandoffManager` (`src/handoff/handoff-manager.ts`, #75)

Per-thread AI↔human ownership with cancellation:

* `register(threadId, controller = new AbortController()): { controller,
  unregister }` — wire the `signal` into in-flight draft generation; this is
  the minimal cancellation interface the auto-reply pipeline (#78) plugs into.
* `takeOver(threadId, reason?)` — synchronously aborts every registered
  controller (well within the 2s budget) and marks the thread human-owned.
* `release(threadId, reason?)` — return ownership to AI.
* `isHumanOwned(threadId)` / `owner(threadId)` / `list()` — query state.
* Emits `ownership.change` (`{ threadId, owner, previous, reason?, at }`).
  Registering a draft on an already human-owned thread aborts it immediately.

## 12.1 Telegram remote-control channel (#47)

The Telegram bot (`src/channels/telegram/`) is openzigs-social's only push +
remote-control surface. It is **opt-in** (`telegram.enabled`, default `false`)
and reads its bot token + primary admin chat id from the encrypted vault. The
grammy `Bot` is **injected** into `TelegramChannel`, so tests intercept every
outgoing API call with a transformer — no network is required to verify the
channel.

`TelegramChannel.register()` wires the bot in a fixed, deny-by-default order:

1. **ACL middleware** (`acl.ts`, #52) — runs first; any update from a chat not
   on the admin allow-list is logged (chat id only) and silently dropped.
2. **`@grammyjs/menu` queue menu** — the interactive `/queue` listing (#48).
3. **Admin commands** (`commands.ts`, #52) — `/start`, `/status`, `/privacy`,
   `/queue`, `/dm`.
4. **Inline approval callbacks** (`approval-keyboard.ts`, #50) — `oz:appr:*`
   callback data, parsed defensively.
5. **Approval-queue bridge** — subscribes to the shared `ApprovalQueue`.

There is exactly one approval system (the #128 `ApprovalQueue`); Telegram is
only a rendering + routing layer on top of it.

```mermaid
sequenceDiagram
  participant Q as ApprovalQueue (#128)
  participant C as TelegramChannel
  participant T as Telegram (admin chat)
  Q->>C: emit "request" (PendingApproval)
  C->>T: sendMessage + Approve/Reject keyboard
  T-->>C: callback_query oz:appr:approve:<id>
  C->>Q: decide(id, "approve")
  Q-->>C: emit "decision" (ApprovalOutcome)
  C->>T: editMessageText "✅ Approved"
```

The **DM relay** (#51) parses `/dm <platform> <recipient> <message>` and
delivers through the `SocialDmSender` port (`channels/social/dm-sender.ts`).
No adapter is wired yet (the platform service #127 owns them), so the relay
reports "unavailable" rather than faking a send — there are no stub network
calls.

## 12.2 Platform service layer (#127)

`src/platform/` holds the cross-cutting, framework-agnostic primitives that
every social connector (Cohort A/B/C), the unified inbox, the auto-reply
pipeline, the outbox, and the DM dispatcher share. Every primitive takes an
injected clock / `sleep` / `emit`, so the whole layer is deterministic under
test — no real timers, no network.

| Sub-issue | Module | Responsibility |
| --- | --- | --- |
| #139 | `oauth/` | OAuth handshake: CSRF state store, connector registry, callback router |
| #140 | `webhooks/` | Inbound webhooks: HMAC verify, dedupe ledger, handler registry, router |
| #141 | `rate-limit/` | Token bucket + per-platform broker with quotas and warnings |
| #142 | `retry/` | Exponential backoff, retry, dead-letter queue |
| #143 | `social-brain/` | Idempotent inbound persistence (contacts/threads/messages) |
| #144 | `dm/` | DM sender registry (the #51 port) + rule-chain dispatcher |

### OAuth (`oauth/`, #139)

`OAuthStateStore` mints single-use, TTL-bounded `state` tokens
(`randomBytes(32)`, base64url) and verifies them in constant time
(`timingSafeEqual`); a consumed or expired state is rejected. `ConnectorRegistry`
maps a platform key to an `OAuthTokenExchanger` port. `createOAuthRouter`
exposes `GET /oauth/callback/:platform`:

* unknown platform → **404**
* missing / expired / replayed `state` → **400**
* exchanger failure → **502** (no secret in the response)
* success → persist `{ accessToken, refreshToken?, expiresAt }` via the vault,
  then redirect to a path-validated success URL (open-redirect guarded).

### Webhooks (`webhooks/`, #140)

HMAC signatures are verified in constant time (`hmac.ts`, sha1/256/512).
`WebhookEventStore.recordIfNew` dedupes deliveries with
`INSERT … ON CONFLICT DO NOTHING` against `webhook_events`. `createWebhookRouter`
mounts at `/webhooks/:platform` on the **raw** body (before `express.json`, so
the signature is computed over exact bytes): bad signature → **401** (no body
echo), duplicate event → **200**, handler throw → **500**.

### Rate limiting (`rate-limit/`, #141)

`TokenBucket` refills against an injected clock. `RateLimitBroker` holds a budget
per platform (`capacity`, `refillPerSec`, optional hard `quota`): `tryAcquire`
never blocks, `acquire` awaits the next refill via injected `sleep` (no tight
loop), and an edge-triggered `rate-limit:warning` event fires once when
utilization crosses 80% (re-arming after the bucket refills back below the
threshold).

### Retry + DLQ (`retry/`, #142)

`computeBackoffMs` is exponential with jitter. `retry` loops up to `maxAttempts`,
throwing `RetryExhaustedError` on the final attempt or immediately on a
non-transient error. `dispatchWithDlq` **never throws** — a terminal failure is
recorded in the `outbox_dlq` table via `DlqRepository` for later inspection.

### SocialBrain (`social-brain/`, #143)

`SocialBrainRepository` upserts contacts, threads, and messages idempotently,
keyed on platform-native ids (`UNIQUE (platform, platform_*_id)`), so a webhook
replay or backfill never duplicates rows.

### DM dispatch + sender registry (`dm/`, #144)

`SocialDmSenderRegistry` **implements the #51 `SocialDmSender` port** by
delegating `sendDm` to a per-platform adapter registered at runtime. This is the
seam that makes Telegram's `/dm` relay (#51) live: `startServer` builds one
shared registry and hands it to both the platform layer and the Telegram
channel, so once a connector registers an adapter the relay stops reporting
"unavailable". `DmDispatcher` runs an ordered rule chain over each inbound DM —
`humanOwnedGuard` (stops when the #128 `HandoffManager` marks the thread
human-owned) and `approvalGatedReply` (routes a draft through the #128
`ApprovalQueue` before sending).

## 12.3 Cohort A connectors — Instagram / Facebook Pages / Threads (#53)

`src/connectors/meta/` is the first concrete connector epic. It consumes the
#127 ports rather than reinventing them, so the connector code is small and
focused on the Meta Graph API (`v25.0`) surface. The whole module is opt-in
behind `platform.meta.enabled` (default `false`); when disabled there is zero
Meta network surface. Every credential — the Meta app id/secret and per-account
access tokens — is read from the encrypted vault (`getMeta()`), never config or
logs, and user-supplied Graph URLs pass through the SSRF guard.

| Sub-issue | Module | Responsibility |
| --- | --- | --- |
| #54 | `graph-client.ts` / `dispatcher.ts` | `MetaGraphClient` transport (SSRF-validated `v25.0` base URLs) + `MetaDispatcher` (broker slot per op, DLQ on failure) |
| #54/#57/#135 | `oauth.ts` | `FacebookOAuthExchanger` + `ThreadsOAuthExchanger` |
| #55/#56 | `instagram/` | publisher, DM sender, inbox poller |
| #57 | `facebook/pages.ts` | pages, posts, comments, insights |
| #135/#136/#137 | `threads/` | publisher, reply poller, insights poller |
| #59 | `webhook-handler.ts` | `x-hub-signature-256` verified handler for all three platforms |
| — | `scheduler.ts` / `index.ts` | poll scheduler + `registerMetaConnectors` wiring |

### How each #127 port is consumed

* **`OAuthTokenExchanger` (#139)** — `FacebookOAuthExchanger` (long-lived
  `fb_exchange_token`) and `ThreadsOAuthExchanger` (`th_exchange_token`)
  implement the port and are registered in the `ConnectorRegistry` for
  `facebook`/`instagram` and `threads`, so the shared `GET /oauth/callback/:platform`
  router persists Meta tokens to the vault unchanged.
* **`WebhookHandler` (#140)** — `createMetaWebhookHandler` verifies the
  `x-hub-signature-256` HMAC via the shared constant-time `hmac.ts`, derives a
  stable `entry[].id:time` event id (deduped by `WebhookEventStore`), and is
  registered in the `WebhookHandlerRegistry` for all three platforms.
* **`RateLimitBroker` (#141)** — `MetaDispatcher.dispatch` acquires a per-op
  broker slot from the `meta` budget before every Graph call; a denied slot is
  routed to the DLQ rather than hammering the API.
* **retry + DLQ (#142)** — terminal/transient failures (classified by
  `isTransientMetaError`) flow through the dispatcher into `DlqRepository`
  (`outbox_dlq`); the dispatcher never throws.
* **`SocialBrainRepository` (#143)** — the IG inbox poller and the Threads
  reply poller persist inbound messages idempotently, so webhook/poll overlap
  never duplicates rows.
* **`SocialDmSenderRegistry` (#144 / #51)** — `InstagramDmSender` implements the
  `SocialDmSender` port and is registered under `instagram`, making Telegram's
  `/dm instagram …` relay live once Meta is connected.

`registerMetaConnectors(deps)` is the single composition seam: `startServer`
calls it (guarded on `platform.meta.enabled`, wrapped in try/catch) to build the
graph clients + dispatcher and wire the exchangers, webhook handlers, and DM
sender into the existing #127 registries.

### Connections endpoint + composer UI

`GET /api/connections` (`src/server/connections/router.ts`) reports a flat list
of `{ platform, label, connected, needsReconsent, expiresAt? }` for Instagram /
Facebook Pages / Threads — derived from vault token state, **never echoing the
tokens themselves**. The Next.js composer (`ui/app/compose/page.tsx`) reads it
via `lib/connections.ts` and renders a per-account publish-target checkbox
(`components/compose/publish-targets.tsx`); disconnected accounts are shown
disabled with a "connect"/"reconnect required" hint.

## 12.4 Cohort B connectors — LinkedIn / Pinterest / TikTok (#60)

`src/connectors/{linkedin,pinterest,tiktok}/` add three more connectors built on
the **same** #127 ports as Cohort A — no connector owns rate-limit, retry,
OAuth-callback, or webhook-verify code of its own. Each module is independently
opt-in behind `platform.{linkedin,pinterest,tiktok}.enabled` (default `false`);
when disabled there is zero network surface for that platform. All app
credentials (LinkedIn client id/secret, Pinterest app id/secret, TikTok client
key/secret) and per-account tokens are read from the encrypted vault
(`getLinkedIn()` / `getPinterest()` / `getTikTok()`) — never config or logs —
and every base/token URL passes through the SSRF guard.

| Sub-issue | Module | Responsibility |
| --- | --- | --- |
| #61 | `linkedin/rest-client.ts` / `dispatcher.ts` / `oauth.ts` / `publisher.ts` / `comment-poller.ts` | REST transport + dispatcher, OAuth exchanger (no-DM scopes), Posts API publisher (member + organization), comment poll → SocialBrain |
| #62 | `linkedin/analytics-poller.ts` | follower count + post engagement → `InsightsRepository` (reuses `platform_insights_raw`) |
| #63 | `pinterest/rest-client.ts` / `dispatcher.ts` / `oauth.ts` / `publisher.ts` / `analytics-poller.ts` | REST transport + dispatcher, OAuth exchanger (HTTP Basic), board/pin publisher, pin analytics → `InsightsRepository` |
| #64 | `tiktok/rest-client.ts` / `dispatcher.ts` / `oauth.ts` / `publisher.ts` / `display-poller.ts` | REST transport (200-with-`error`-envelope aware) + dispatcher, OAuth exchanger, video publisher, profile/video display poll → `InsightsRepository` |
| — | `*/index.ts` | `register{LinkedIn,Pinterest,TikTok}Connectors` composition seam |

### How each #127 port is consumed

* **`OAuthTokenExchanger` (#139)** — each connector registers exactly one
  exchanger (`linkedin` / `pinterest` / `tiktok`) into the shared
  `ConnectorRegistry`, so the same `GET /oauth/callback/:platform` router
  persists tokens to the vault unchanged. LinkedIn uses a form-body exchange,
  Pinterest uses HTTP Basic auth, TikTok puts `client_key`/`client_secret` in
  the form body.
* **`RateLimitBroker` (#141)** — every mutating/poll op acquires a per-op slot
  from that platform's budget (`linkedin` / `pinterest` / `tiktok`) before the
  HTTP call; a denied slot lands in the DLQ instead of hammering the API.
* **retry + DLQ (#142)** — per-platform `isTransient*Error` classifiers feed the
  shared `dispatchWithDlq`; the dispatchers never throw.
* **`SocialBrainRepository` (#143)** — LinkedIn's comment poller persists inbound
  comments idempotently (skips already-seen platform message ids).
* **analytics (#96)** — LinkedIn, Pinterest, and TikTok all reuse the existing
  `InsightsRepository` / `platform_insights_raw` table (migration `0003`); no
  new migration is introduced by this epic. Readings are idempotent on
  `(platform, object_type, object_id, metric, captured_for)`.

No Cohort B platform exposes inbound webhooks in v1, so each relies on the
polling fallback only — no `WebhookHandler` is registered.

### v1 platform limitations

* **LinkedIn — no direct messages (#61).** LinkedIn DM requires the gated
  Compliance Partner Program. The connector intentionally registers **no** DM
  sender, and `assertNoDmScopes()` rejects any messaging scope at exchanger
  construction (fails closed). LinkedIn v1 is publish + read-comments/analytics
  only.
* **TikTok — PRIVATE-only publishing (#65).** Until the app passes TikTok's
  content-posting audit, the "Unaudited Client" restriction forces every post
  to PRIVATE. `TikTokPublisher` hard-codes `privacy_level: "SELF_ONLY"` on every
  request and `assertPrivateOnly()` throws if a caller ever requests a public or
  mutual-follow visibility (fail closed); the public privacy levels are never
  sent. The composer surfaces `TikTokNotice` whenever TikTok is selected so the
  user understands the constraint before publishing.

The connections endpoint and composer UI from §12.3 are platform-agnostic and
extend to LinkedIn / Pinterest / TikTok automatically (the platform list lives
in `src/server/connections/router.ts`).

## 12.5 Cohort C connector — X / Twitter v2 (#66)

`src/connectors/twitter/` adds the X (Twitter) v2 connector on the **same** #127
ports as Cohorts A/B — no connector-local rate-limit, retry, OAuth-callback, or
webhook-verify code. It is opt-in behind `platform.twitter.enabled` (default
`false`); when disabled there is zero X network surface and no quota route is
mounted. The X app `clientId`/`clientSecret` and per-account OAuth tokens live
only in the encrypted vault (`getTwitter()` / `getOAuth("twitter")`) — never
config or logs — and every API/token URL passes through the SSRF guard
(`assertSafeUrl`).

| Sub-issue | Module | Responsibility |
| --- | --- | --- |
| #67 | `twitter/rest-client.ts` / `dispatcher.ts` / `oauth.ts` | OAuth 2.0 PKCE exchanger (public + confidential clients), SSRF-guarded REST transport (429/5xx-aware error envelope), dispatcher over the shared broker + DLQ |
| #68 | `twitter/publisher.ts` / `tiers.ts` | Tweet + reply publisher; per-tier write-quota sizing (Free / Basic / Pro) and DM-permission policy |
| #69 | `twitter/credit-tracker.ts` / `quota-guard.ts` | Month-to-date write-credit ledger (`twitter_credit_usage`, migration `0004`, idempotent on `dedupe_key`) + edge-triggered warn/exceed guard |
| #70 | `twitter/dm.ts` / `analytics-poller.ts` / `index.ts` | DM sender + inbound DM poller (paid-tier only), follower/tweet-metric analytics → `InsightsRepository`, `registerTwitterConnectors` composition seam |

### How each #127 port is consumed

* **`OAuthTokenExchanger` (#139)** — registers one `twitter` exchanger into the
  shared `ConnectorRegistry`; the existing `GET /oauth/callback/:platform`
  router persists tokens unchanged. The exchanger uses OAuth 2.0 with PKCE; a
  public client puts `client_id` in the body, a confidential client uses HTTP
  Basic. Default scopes never request `dm.*`.
* **`RateLimitBroker` (#141)** — a dedicated broker carries two budgets:
  `twitter` (general writes) and `twitter-dm` (X's 15 req / 15 min + 1440 / 24 hr
  DM limit, expressed as a daily `quota`). Every write/DM/poll op acquires a slot
  before the HTTP call; a denied slot lands in the DLQ.
* **retry + DLQ (#142)** — `isTransientTwitterError` (429 + 5xx) feeds the shared
  `dispatchWithDlq`; the dispatcher never throws.
* **`SocialBrainRepository` (#143)** — the inbound DM poller persists DMs
  idempotently (skips already-seen message ids).
* **analytics (#96)** — follower counts and per-tweet metrics (likes, retweets,
  replies, quotes, impressions) reuse `InsightsRepository` /
  `platform_insights_raw` (migration `0003`), idempotent on
  `(platform, object_type, object_id, metric, captured_for)`.

### Write-quota tracking + surfacing

X's v2 API meters monthly **writes** (tweets + replies + DMs) per access tier.
`TwitterCreditTracker` records each successful write into `twitter_credit_usage`
(migration `0004`), idempotent on the connector-supplied `dedupeKey` so retries
never inflate usage. `TwitterQuotaGuard` compares month-to-date usage against the
tier cap (`tiers.ts`: Free 1 500, Basic 50 000, Pro 1 000 000 by default) and is
**edge-triggered**: it emits a `twitter:quota` socket event and fires a Telegram
alert exactly once per threshold crossing (warn at `warnThreshold`, default 0.8;
and at exhaustion). `ensureWithinQuota()` throws `TwitterQuotaExceededError`
**before** any API call once the cap is reached, so the connector fails closed
rather than incurring overage. `GET /api/twitter/quota`
(`src/server/twitter/router.ts`, rate-limited 60 req/min) recomputes the summary
from the ledger on each request — reading only non-secret aggregates, never token
material — and the `TwitterQuotaPanel` UI widget (`ui/components/`) renders it
live off the socket event.

### v1 platform limitations

* **DM disabled by default, and force-disabled on Free (#70).** `dmEnabled`
  defaults to `false`. Even when set, the Free tier force-disables DM
  (`isDmEnabledForTier` mirrors X gating DM behind paid access): on Free the
  connector registers **no** DM sender and `TwitterDmSender.sendDm()` throws
  `TwitterDmDisabledError` (fail closed). DM is only ever live on a paid tier
  with `dmEnabled: true`.
* **Polling-only inbound.** No X webhook is registered in v1; inbound DMs and
  metrics rely on the polling fallback only.

The connections endpoint and composer UI extend to X automatically (the platform
list lives in `src/server/connections/router.ts`, labelled `X (Twitter)`).

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
* `GET /api/metrics` — current per-platform counters. Responds with a flat
  JSON envelope (not Prometheus plain-text):
  `{ "timestamp": "<ISO-8601>", "metrics": { "<platform>": { "sent": n,
  "received": n, "failed": n } } }`. The `metrics` snapshot is the same
  payload broadcast over Socket.IO as `metrics:update` whenever a counter
  changes (`src/server/metrics.ts`).

### Setup wizard endpoints (`src/server/setup/`)

First-run wizard support (epic #129). All routes are mounted under `/api/setup`
and require an injected `CredentialVault`; secrets are validated server-side and
persisted to the vault — keys/tokens never leave the local process beyond the
provider/Telegram verification call, and are never logged or echoed back.

* `POST /api/setup/validate-key` — body `{ provider, apiKey, baseUrl?, model? }`
  where `provider ∈ { openai, anthropic, openai-compatible }`. Validates the
  BYOK key against the provider's lightweight `/models` endpoint
  (`provider-validator.ts`), then stores it via `vault.setProvider`. Returns
  `{ valid: true, provider, stored: true }` on success, `{ valid: false,
  provider, reason }` for a rejected key, or `400` for a malformed body / blocked
  base URL. OpenAI-compatible base URLs pass through the SSRF guard in
  `ssrf.ts` (blocks loopback, RFC1918, link-local/metadata, non-HTTP(S)).
* `POST /api/setup/telegram/verify` — body `{ botToken, adminChatId }`. Calls
  Telegram `getMe`, then sends a one-time test message to the admin chat
  (`telegram-verify.ts`); on success stores both via `vault.setTelegram`.
  Returns `{ valid: true, stored: true, botUsername? }` or `{ valid: false,
  reason }`.
* `GET /api/setup/status` — returns `{ complete, hasProvider, hasTelegram }`
  derived from current vault contents.

This is a minimal verification skeleton; full Telegram integration is tracked in
epic #47 and the polished onboarding flow in #100.

