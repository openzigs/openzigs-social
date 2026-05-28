# Contributing to openzigs-social

Thanks for your interest in helping build openzigs-social. This is a small project — clear, focused contributions are what move it forward.

## Quality gate

Before you open a pull request, the following must pass locally:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
cd ui && pnpm lint && pnpm build && cd ..
```

CI runs the same gate plus CodeQL, gitleaks, and (on relevant changes) a graphify refresh.

## Branch naming

Use a short type prefix:

- `feat/<slug>` — new feature
- `fix/<slug>` — bug fix
- `chore/<slug>` — tooling, deps, docs-only
- `refactor/<slug>` — internal change with no behaviour difference

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(inbox): unify Instagram and Facebook DM streams
fix(telegram): retry inline keyboard callback on timeout
chore(deps): bump grammy to 1.40.1
```

The body should explain **why**, not what — the diff already shows what.

## Pull requests

- Reference the issue your PR resolves in the description (`Closes #123`).
- Keep PRs small and reviewable. If a PR exceeds ~400 changed lines, consider splitting it.
- Tick the relevant boxes in the PR template (type of change, version bump tag, testing notes).
- A maintainer will run a Gilfoyle-style code review. Expect direct feedback.

## Optional: graphify hook

If you want fast "where is X defined / used" answers while developing, install [graphify](https://github.com/openzigs/graphify):

```bash
pipx install graphifyy==0.5.6
graphify build .
```

This populates `graphify-out/` (which is committed for the CI graphify-refresh workflow). The AI agents and `copilot-instructions.md` know to read `graphify-out/GRAPH_REPORT.md` before doing a wide search.

## Tests

- Unit tests live next to source files: `foo.ts` → `foo.test.ts`.
- Use Vitest. UI tests use `@testing-library/react` + jsdom.
- Time-dependent code accepts an injectable `clock?: () => Date` for deterministic tests.
- Avoid network calls — mock the platform API client at the boundary.

## Code style

- TypeScript ESM only (`"type": "module"`). Use `.js` extensions on relative imports.
- Tailwind v4 CSS-first; no `tailwind.config.js`.
- Default to small, composable functions over classes unless state requires a class.
- Don't add backwards-compat shims, feature flags, or speculative abstractions — fix the call sites instead.
