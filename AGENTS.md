# AGENTS.md — openzigs-social

This file is read by AI coding agents (GitHub Copilot, Cursor, Claude Code, etc.) before working in this repository. Follow all rules below without exception.

---

## Project overview

**openzigs-social** is a local-first, single-tenant social media manager. Key properties:

- Single-tenant — runs on the operator's machine; no multi-user separation needed
- Local-first — all data stays on disk; cloud AI providers are opt-in BYOK
- TypeScript ESM monorepo with two workspaces: root (Node server) and `ui/` (Next.js)
- Default LLM: Gemma 4 via Ollama. BYOK for OpenAI / Anthropic / OpenAI-compatible

**Monorepo layout:**

```
openzigs-social/
├── src/                  # Node 22 TypeScript API server
│   ├── server.ts         # Entry point
│   ├── server/           # Express + Socket.IO composition root (startServer)
│   ├── config/           # Zod schema + layered config
│   ├── copilot/          # CopilotWrapper, smart router, privacy mode, providers
│   ├── vault/            # AES-256-GCM credential vault
│   ├── db/               # better-sqlite3 bootstrap + migration runner
│   ├── channels/         # Telegram bot (grammy)
│   ├── platform/         # OAuth, webhooks, rate-limit, retry, social-brain, DM
│   ├── connectors/       # Meta, LinkedIn, Pinterest, TikTok, Twitter, YouTube
│   ├── inbox/            # Unified inbox: rules engine, FTS, read model
│   ├── outbox/           # Content calendar, scheduler, retry, DLQ
│   ├── personality/      # Linguistic profiler, brand-voice rulebook
│   ├── routing/          # Auto-reply pipeline, threshold gate, audit log
│   ├── crm/              # CRM identity, lead scoring, merging, GDPR delete
│   ├── analytics/        # Aggregator, heatmap, top-posts, digest, mailer
│   └── approvals/        # ApprovalQueue + HandoffManager
├── ui/                   # Next.js 16.2 App Router UI (port 3001)
│   ├── app/              # Route segments (inbox, compose, calendar, contacts, etc.)
│   ├── components/       # React components
│   └── lib/              # API client fetchers + React Query hooks
├── migrations/           # Append-only SQL migration files (NNNN-name.sql)
├── config/
│   ├── default.json      # Built-in defaults — do not edit; use local.json overlay
│   └── local.json        # Your local overlay (git-ignored)
├── docs/                 # Architecture, user guide, OAuth walkthroughs, ADRs
├── graphify-out/         # Auto-generated knowledge graph (do not hand-edit)
└── coverage/             # Test coverage reports (do not commit)
```

---

## Build commands

All commands run from the **repo root** unless prefixed with `cd ui &&`.

| Purpose | Command |
|---|---|
| Install all dependencies | `pnpm install` |
| Dev server (API, port 3000) | `pnpm dev` |
| Dev UI (Next.js, port 3001) | `cd ui && pnpm dev` |
| Build server | `pnpm build` |
| Build UI | `cd ui && pnpm build` |
| Start compiled server | `pnpm start` |
| Run server tests | `pnpm test` |
| Run server tests with coverage | `pnpm test:coverage` |
| Run UI tests | `cd ui && pnpm test` |
| Lint server | `pnpm lint` |
| Lint UI | `cd ui && pnpm lint` |
| Type-check server | `pnpm typecheck` |
| Type-check UI | `cd ui && pnpm typecheck` |
| Run e2e tests | `cd ui && npx playwright test` |

**Full quality gate** (run before every PR):

```bash
pnpm lint && pnpm typecheck && pnpm test && cd ui && pnpm lint && npx next build
```

**Coverage gate:** every PR must reach ≥ 80% statement/branch/function/line coverage. Check with `pnpm test:coverage` and verify the numbers before opening a PR.

---

## Test commands

```bash
# Server unit tests (vitest, exits after run)
pnpm test

# Server unit tests + coverage report
pnpm test:coverage

# UI unit tests (vitest + @testing-library/react)
cd ui && pnpm test

# E2e tests (Playwright, requires dev servers running)
cd ui && npx playwright test
```

Unit test files live next to the source file they test: `foo.ts` → `foo.test.ts`. Never use network calls in unit tests — mock the platform API client at the module boundary.

---

## Code conventions

### TypeScript

- **Strict mode enabled** — `"strict": true` in all `tsconfig.json` files
- **ESM only** — `"type": "module"` in all `package.json`. All relative imports must use the `.js` extension (e.g. `import { foo } from './foo.js'`)
- **No default exports** — named exports only
- **No barrel `index.ts` files for server modules** — import directly from the module file
- **Zod for all API boundary validation** — every Express handler validates its request body/params/query with a Zod schema; never trust raw `req.body`
- **No `any`** — use `unknown` and narrow with type guards

### SQL

- **Parameterized queries only** — no string concatenation or template literals in SQL. Use `db.prepare('SELECT … WHERE id = ?').get(id)` or named parameters
- Every `LIMIT` must be clamped at the repository boundary (non-positive / non-finite → default; max capped). A forged `LIMIT -1` must never return an unbounded set
- **Migrations are append-only** — never edit an existing migration file. Add a new `NNNN-name.sql` file instead

### Security

- Never log credentials, API keys, OAuth tokens, or secrets. The Winston redactor strips known sensitive keys, but do not rely on it — do not emit them in the first place
- Never hardcode secrets — read from the vault (`CredentialVault`) or environment variables
- Never call `eval`, `new Function`, or `vm.runInContext` — especially in rule-engine or template code
- Never use `--no-verify` to bypass lint/typecheck gates
- All external URLs must pass through `assertSafeUrl()` (`src/server/setup/ssrf.ts`) before use in an HTTP call — blocks loopback, RFC1918, link-local, metadata, and CGNAT

### Style

- **No shell-out** — never use `child_process.exec/spawn` or similar. If you think you need it, you don't
- **Tailwind v4 CSS-first** in `ui/` — no `tailwind.config.js`
- **Small, composable functions** over classes unless state clearly requires a class
- **No speculative abstractions** — build for today's use case; refactor when the third caller appears

---

## Agent workflow

1. **Read the knowledge graph first.** If `graphify-out/GRAPH_REPORT.md` exists, read it before any wide file search. It is a precomputed summary of 1,800+ nodes and their connections — it saves tokens and finds the right module faster than grep.

2. **Use `graphify query` for targeted exploration:**
   ```bash
   graphify query "CrmRepository deleteContact" graphify-out/graph.json
   graphify path src/crm/gdpr.ts src/server/crm/router.ts graphify-out/graph.json
   ```
   Fall back to `grep_search` only for files modified after the graph was last built.

3. **Write tests before or alongside implementation** (TDD). Run `pnpm test` after each logical change.

4. **Run the full quality gate** before opening a PR:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test && cd ui && pnpm lint && npx next build
   ```

5. **Branch naming:** `feature/issue-<n>-<slug>` for features, `fix/issue-<n>-<slug>` for bugs.

6. **Conventional commits:** `feat(module): description`, `fix(module): description`, `docs(section): description`, `chore(scope): description`.

7. **Always include `Closes #N`** in the PR body for every issue resolved.

8. **Coverage gate:** `pnpm test:coverage` must show ≥ 80% for all four metrics before creating a PR. Add tests if the gate doesn't pass.

9. **Update living docs:** after significant changes, update `docs/ARCHITECTURE.md` and `docs/USER_GUIDE.md`.

---

## Restricted areas / caution zones

| Path | Rule |
|---|---|
| `~/.openzigs-social/auth.json` | The credential vault. Never log its contents. Never read it directly — use `CredentialVault` methods only |
| `migrations/` | **Append-only.** Never edit existing `.sql` files. A file that has been applied to any real database cannot be modified — it would corrupt the migration ledger. Add a new numbered file instead |
| `graphify-out/` | Auto-generated by the CI `graphify-refresh` workflow. Never hand-edit `graph.json` or `GRAPH_REPORT.md` — they will be overwritten on the next CI run |
| `config/default.json` | The canonical default config. Never edit for local development — use `config/local.json` (git-ignored) or `user.json` in the data directory |
| `coverage/` | Auto-generated test artifact. Never commit coverage output |

---

## Security rules (non-negotiable)

1. **No credentials in logs, commits, or console output** — ever
2. **No hardcoded secrets** — vault or environment variables only
3. **Parameterized SQL always** — no exceptions
4. **No lint/typecheck bypass** — no `--no-verify`, no `// @ts-ignore`, no `eslint-disable` without a documented justification
5. **All user-supplied URLs must pass `assertSafeUrl()`** before any HTTP fetch
6. **No `eval` or dynamic code execution** anywhere in the codebase
7. **No shell-out** (`child_process`, `exec`, `spawn`, etc.)
