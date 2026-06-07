# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-06-05

### Added
- **Backup / export / import (#147)** (`src/vault/backup.ts`, `src/vault/restore.ts`, `src/server/backup/router.ts`, `migrations/0013-backup-log.sql`, `ui/lib/backup.ts`, `ui/components/backup/backup-section.tsx`): `POST /api/backup/export` streams an AES-256-GCM encrypted bundle (scrypt N=2^17 KDF, random 32-byte salt) containing the SQLite database and credential vault. `POST /api/backup/import` accepts multipart/form-data, decrypts, validates, and restores. Wrong passphrase or corrupt bundle returns 422; passphrase is never logged, echoed, or stored. `backup_log` audit table records every export/import event. Settings page gains Export backup and Import backup cards.
- **`docs/USER_GUIDE.md` (#115)**: fleshed out all stub sections.
- **`docs/ARCHITECTURE.md` (#116)**: §1 Overview, §12.11 GDPR right-to-delete, §12.12 YouTube quota tracker.
- **8 per-platform OAuth walkthroughs, `docs/oauth/` (#117)**: twitter-x, instagram, facebook, threads, linkedin, youtube, pinterest, tiktok.
- **Refreshed `README.md` and updated `CONTRIBUTING.md` (#118)**: OSS-quality README with badges and feature tables; CONTRIBUTING with full dev loop.
- **`AGENTS.md` at repo root (#145)**: AI-agent instruction file.
- **GDPR right-to-delete (#138)**: `deleteContact()` single-transaction cascade, `DELETE /api/contacts/:id?cascade=`, ContactDetailView Delete button with confirmation dialog.
- **YouTube Data API v3 daily quota tracker (#58)**: `youtube_quota_usage` table, `GET /api/youtube/quota`, `YouTubeQuotaWidget`.
- **Onboarding polish — Telegram-driven setup, voice import, and tour (epic #100)**: guided onboarding flow, model selection, per-platform OAuth, Meta app wizard, starter recipes, brand-voice import, contextual coach-marks.
- **Analytics dashboard (epic #95)**: engagement aggregation, top posts, posting-time heatmap, weekly Telegram + email digest.
- **Light CRM (epic #90)**: cross-platform identity, lead scoring, conversation history, suggested + manual merge.
- **AI auto-reply with brand voice / Linguistic Profiler (epic #78)**: voice scoring, threshold gate, append-only audit ledger, approval queue.
- **Outbox + content calendar + scheduler (epic #84)**: draft-to-publish pipeline, drag-to-reschedule calendar, retry + dead-letter queue.
- **Unified inbox + comment rule engine (epic #71)**: declarative condition DSL, FTS5 search, per-platform reply constraints, live updates.
- **X (Twitter) v2 connector (epic #66)**: write-quota tracking, PKCE OAuth, DM poller, analytics.
- **LinkedIn, Pinterest, TikTok connectors (epic #60)**: PRIVATE-only TikTok publishing, LinkedIn comments-only.
- **Meta (Instagram / Facebook Pages / Threads) connectors (epic #53)**: Graph API v25.0, webhook HMAC, IG DM sender.
- **Platform service layer (epic #127)**: OAuth handshake, webhook ingestion, token-bucket rate limiting, retry + DLQ, SocialBrain store, DM dispatch.
- **Telegram remote-control channel (epic #47)**: bot with ACL, menu-driven approval queue, push-notification channel.
- **Foundation (epic #35)**: AES-256-GCM vault, Zod config, Winston logging, better-sqlite3 + WAL migrations, Express 5 + Socket.IO.

### Changed
- **v1.0 release readiness (#119, #120, #146)**: CI coverage gate on every PR (`pnpm coverage` / `pnpm test:coverage`) with HTML artifact upload. `@cyclonedx/cdxgen` and `license-checker` added as devDependencies. `pnpm sbom` and `pnpm licenses` scripts added. Package version bumped `0.0.1` → `0.1.0`.

### Fixed
- Surface Ollama version gate during onboarding pull (epic #100): HTTP 412 returns `409 {code:"ollama_outdated"}` with update link.
- Guard thinking-model token budget: `max_tokens` only sent when explicitly capped.
- Correct ≥ 16 GiB Ollama default: `pickGemma4Variant()` returns `gemma4:12b`.
- Retain rule-firing audit rows on rule deletion: migration `0006` adds `ON DELETE SET NULL`.
- Misleading "encrypted vault" comments in `src/analytics/mailer.ts` and `src/config/schema.ts` corrected to reference `OPENZIGS_SOCIAL_SMTP_PASSWORD` env var (#167).
- `EngagementChart` `ResponsiveContainer` now uses explicit `height={288}` — eliminates first-paint `width(-1)/height(-1)` console warning (#168).
- `CrmRepository.listContacts` N+1 query pattern replaced with three batched `json_each`-expanded statements — query count is now constant regardless of page size (#165).
- `auto_reply_audit` retention policy: configurable `autoReply.retention` block (default 90-day window + 50 000-row cap) with daily cron prune — prevents unbounded table growth (#163).
- GDPR cascade toggle in ContactDetailView (#138 AC3).
- Delete dialog stays open on API error (#138 AC3).
- REST API CORS headers scoped to configured `server.uiOrigin`.
- Added `ui/app/icon.svg` to eliminate favicon 404.

### Security
- Rate-limit inbox mutation endpoints (PR #158): inbox reply, mark-read, and rule CRUD now behind 60-req/min/IP limiter. Closes CodeQL `js/missing-rate-limiting` High.
- Prototype-safe rule fact lookup: `Object.hasOwn(facts, field)` guard.
- Hardened SSRF guard: alternate IPv4 encodings, IPv4-mapped IPv6, CGNAT blocked, `redirect: "manual"` on provider validation.
- Next.js 14.2.35 → 16.2 clearing residual high-severity advisories.
- Value-level secret scrubbing in Winston logging pipeline.
- `uuid >=11.1.1` and `glob >=10.5.0` via pnpm overrides.

[Unreleased]: https://github.com/openzigs/openzigs-social/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/openzigs/openzigs-social/releases/tag/v0.1.0
