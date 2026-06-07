# Contributing to openzigs-social

Thanks for your interest in helping build openzigs-social. This guide gets you from zero to a running dev environment and explains everything you need to open your first pull request.

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 22+ | <https://nodejs.org/> |
| pnpm | 10+ | `npm install -g pnpm` |
| Ollama | ≥ 0.30.5 (optional) | <https://ollama.com/download> |

Ollama is optional — you can use a BYOK cloud provider instead. But for the default local-LLM path, install Ollama and pull a Gemma 4 variant: `ollama pull gemma4:e4b` (8–16 GiB) or `ollama pull gemma4:e2b` (< 8 GiB).

## Clone and install

```bash
git clone https://github.com/openzigs/openzigs-social.git
cd openzigs-social
pnpm install
```

`pnpm install` at the root installs both the server workspace and the `ui/` workspace in one shot.

## Configure

```bash
cp config/default.json config/local.json
```

Edit `config/local.json` to set your preferences. The most common things to change:
- `platform.*` — enable the social platforms you want to test
- `telegram.enabled` — set to `true` if you have a bot token

Credentials (API keys, OAuth tokens) are stored in the encrypted vault at `~/.openzigs-social/auth.json` — never in `local.json`.

## Run (development)

In two separate terminals:

```bash
# Terminal 1 — API server with hot-reload on port 3000
pnpm dev

# Terminal 2 — Next.js UI with hot-reload on port 3001
cd ui && pnpm dev
```

Open `http://localhost:3001`. The setup wizard at `/setup` connects your AI provider and Telegram bot; the onboarding tab at `/onboarding` walks through per-platform OAuth.

## Quality gate

Run this before opening a pull request — CI runs the same checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && cd ui && pnpm lint && npx next build
```

All four steps must pass with zero errors. The `pnpm test` step runs vitest with coverage — every PR must reach ≥ 80% statement/branch/function/line coverage. Check with:

```bash
pnpm test:coverage
```

## Running e2e tests

```bash
cd ui && npx playwright test
```

Playwright tests live in `ui/e2e/`. They require the dev servers to be running (`pnpm dev` and `cd ui && pnpm dev` in separate terminals). The `playwright.config.ts` in `ui/` handles the setup.

## Branch and commit conventions

**Branch naming:** `feature/issue-<n>-<short-slug>` (e.g. `feature/issue-114-documentation`). For bugs: `fix/issue-<n>-<slug>`.

**Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(inbox): unify Instagram and Facebook DM streams
fix(telegram): retry inline keyboard callback on timeout
docs(user-guide): add GDPR delete section
chore(deps): bump grammy to 1.40.1
```

The body should explain **why**, not what — the diff already shows what.

## Pull requests

- Reference the issue your PR resolves: `Closes #123`
- Keep PRs small and reviewable (< ~400 changed lines when possible). Split larger changes across multiple PRs.
- Tick the relevant boxes in the PR template.
- A maintainer will review with Gilfoyle-level directness. Expect technical feedback.

## Graphify knowledge graph

If `graphify-out/GRAPH_REPORT.md` exists at the repo root, **read it before doing a wide file search** — it is a precomputed summary of the entire codebase and saves tokens. Then use `graphify query "<terms>" graphify-out/graph.json` to get a token-bounded subgraph for the area you're working in.

To rebuild the graph locally:

```bash
pipx install graphifyy==0.5.6
graphify build .
```

This populates `graphify-out/` (which is committed and refreshed by CI).

## Tests

- Unit tests live next to source files: `foo.ts` → `foo.test.ts`.
- Use Vitest. UI tests use `@testing-library/react` + jsdom.
- Time-dependent code accepts an injectable `clock?: () => Date` for deterministic tests.
- Avoid network calls — mock the platform API client at the boundary.
- Coverage gate is **80% statement/branch/function/line** — enforced on every PR.

## Code style

- TypeScript ESM only (`"type": "module"`). Use `.js` extensions on relative imports.
- Tailwind v4 CSS-first; no `tailwind.config.js`.
- Default to small, composable functions over classes unless state requires a class.
- Don't add backwards-compat shims, feature flags, or speculative abstractions — fix the call sites instead.
- All SQL must use parameterized queries — no string concatenation.

## Cutting a release

> **Important:** Only maintainers with push access to `main` and the ability to
> create tags should follow this process.

### Prerequisites

1. All PR checks are green on `main`.
2. `CHANGELOG.md` has a `## [X.Y.Z] — YYYY-MM-DD` section for the version being released.
3. `package.json` (root) and `ui/package.json` have the correct `"version"` value.

### Steps

```bash
# 1. Ensure you are on main and it is up to date
git checkout main && git pull --ff-only origin main

# 2. Verify the quality gate passes locally
pnpm lint && pnpm typecheck && pnpm test && cd ui && pnpm lint && npx next build && cd ..

# 3. Create and push the annotated tag — this triggers the release workflow
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

Pushing the tag triggers `.github/workflows/release.yml` which:
- Runs the full quality + coverage gate
- Checks license compatibility (`pnpm licenses- Checks license compatibility (`pnpm licenses- Checks license compatibility (`pnpm licenses-Docker image to `ghcr.io/- Checks license compatibility (`pnpm licenses- Checks license compatibilitM fil- Checks license compatibility (`pnp

### H### H### H### H#For### H### H### H### H#For### H### H##-p### H### H### H### H#For### H### H### H### H#For### H### H##-p### H### H### H### H#For# the tag steps above with the new version number.
