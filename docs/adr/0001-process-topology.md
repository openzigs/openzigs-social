# ADR 0001: Process topology and filesystem layout

- **Status**: Accepted
- **Date**: 2026-05-29
- **Deciders**: openzigs-social maintainers
- **Epic**: #35 (Foundation) — sub-issue #134
- **Supersedes**: none

## Context

openzigs-social ships in two deployment shapes:

1. **Tauri desktop app** on macOS and Windows (epic #108) — the primary target.
2. **Docker self-host** for power users running headless.

Both shapes need to run the Node/TypeScript server (Express + Socket.IO +
SQLite + the Copilot SDK agent runtime) and persist data locally:

- the credential vault (`auth.json`, AES-256-GCM, mode `0o600`),
- the SQLite database (`openzigs-social.db`, WAL mode),
- conversation transcript sessions (JSONL + metadata sidecars),
- Winston logs and append-only audit JSONL.

Two questions had to be settled before any persistence sub-issue (#39, #40,
vault, repositories) could land:

1. **Process model** — is the Node server a *single process* that Tauri spawns
   and supervises, or is it *embedded in-process* via N-API inside the Tauri
   (Rust) binary, or a *separately installed daemon*?
2. **Filesystem layout** — where do those files live, especially under a
   **notarized / sandboxed macOS** build where `~/` is *not* the user's real
   home and writing to `~/.openzigs-social/` silently lands in a per-app
   container or fails?

## Decision

### 1. Process model — single Node process, spawned as a managed sidecar

For v1 we run **one Node process**: the server. The Tauri desktop shell
(epic #108) spawns it as a managed child process (Tauri "sidecar"), supervises
its lifecycle, and tears it down on quit. The UI (Next.js) talks to it over
HTTP + Socket.IO on a loopback port. Docker runs the exact same Node process as
its entrypoint, with no Tauri layer.

This keeps a single, identical runtime across both deployment shapes and avoids
maintaining an N-API bridge.

### 2. Filesystem layout — one `resolveDataDir()` helper, env-overridable

All persistence code derives its paths from a single helper,
[`resolveDataDir()`](../../src/config/paths.ts). **No module hardcodes
`~/.openzigs-social/`.** Resolution order:

1. `OPENZIGS_SOCIAL_HOME` environment variable, if set and non-blank.
2. Otherwise `~/.openzigs-social/`.

| Deployment | Data dir root |
| --- | --- |
| Dev / Docker | `~/.openzigs-social/` |
| Notarized / sandboxed macOS (Tauri) | `$HOME/Library/Application Support/social.openzigs.app/` — the Tauri launcher sets `OPENZIGS_SOCIAL_HOME` to this before spawning the sidecar |
| Tests | `os.tmpdir()/<unique>` via `OPENZIGS_SOCIAL_HOME` |

Concrete paths in both modes (all under the resolved root):

| File | Path |
| --- | --- |
| Vault | `<root>/auth.json` (`0o600`) |
| SQLite | `<root>/openzigs-social.db` (+ WAL/SHM) |
| Sessions | `<root>/sessions/<id>.jsonl` + `<id>.meta.json` |
| Logs | `<root>/logs/openzigs-social.log` |
| Audit | `<root>/audit/audit.jsonl` |
| User config | `<root>/user.json` |

The Tauri build is responsible for choosing a writable, sandbox-legal directory
(via the OS "app support" API) and exporting it as `OPENZIGS_SOCIAL_HOME`. The
server never needs to know it is sandboxed.

## Alternatives considered

- **Embedded N-API (Node in the Tauri Rust binary).** Tightest integration and
  no loopback port, but it couples the agent runtime to the desktop build,
  complicates the Docker path (which has no Tauri), and makes crashes take down
  the UI shell. Rejected for v1.
- **Separately installed system daemon** (launchd / systemd service). Good for
  always-on self-host, but heavy onboarding for a desktop-first app and awkward
  to sandbox on macOS. Deferred; can be added later without changing the data
  layout.
- **Hardcoded `~/.openzigs-social/` everywhere.** Simplest, but breaks under
  sandboxed macOS and is untestable without writing to the real home dir.
  Rejected in favour of `resolveDataDir()`.

## Consequences

- **Positive**: one runtime for desktop + docker; persistence paths are
  testable (point `OPENZIGS_SOCIAL_HOME` at a tmp dir); sandboxed macOS is a
  config concern, not a code concern.
- **Positive**: the vault (epic #28) was refactored to derive its path from
  `resolveDataDir()` (`vaultPath()`), so it inherits the override for free.
- **Negative**: a loopback port must be chosen and (on desktop) coordinated
  between the Tauri shell and the sidecar; covered when epic #108 lands.
- **Follow-up**: the Tauri launcher's `OPENZIGS_SOCIAL_HOME` wiring and port
  handshake are tracked under epic #108 and are out of scope for #35.
