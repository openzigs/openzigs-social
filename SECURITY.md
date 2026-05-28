# Security Policy

## Supported Versions

openzigs-social is pre-1.0. Only the `main` branch receives security fixes.

| Version | Supported |
|---------|-----------|
| `main`  | ✅        |
| < 0.1   | ❌        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email **security@openzigs.ai** with:
- A description of the issue and its impact.
- Steps to reproduce.
- Affected version / commit SHA.
- Any suggested mitigation.

Response targets:
- Initial acknowledgement: within **48 hours**.
- Triage + severity assessment: within **7 days**.
- Fix or mitigation plan: within **30 days** for high/critical issues.

## Scope

In scope:
- Credential handling and the vault (`~/.openzigs-social/auth.json`).
- Approval queue, brand-voice gating, and the AI auto-reply pipeline.
- Telegram remote-control channel and message router.
- Platform OAuth flows and per-user Meta app pattern.
- HTTP server, Socket.IO transport, and any future REST/MCP surface.

Out of scope:
- Vulnerabilities in upstream LLM providers, OS-level Ollama installations, or third-party social platforms.
- Issues that require physical access to an unlocked machine.

## Deployment Best Practices

- Keep `auth.json` at mode `0600`.
- Use privacy mode (`global`) when handling regulated content — forces local-only inference.
- Run the Tauri desktop build or docker-compose stack behind your local firewall; do not expose the HTTP/Socket.IO port to the public internet.
- Rotate BYOK provider keys and Telegram bot tokens on a regular schedule.

## Security Features

- **Approval queue** — every outbound publish or platform DM reply can be gated behind a human approval (Telegram inline keyboard or web UI).
- **Brand-voice gate** — AI replies must pass a confidence + Linguistic Profiler check before auto-sending.
- **Audit logger** — append-only JSONL log of all tool calls, approvals, and platform writes.
- **Secret vault** — credentials are written with `0o600` permissions; no secrets in process arguments.
- **Smart router + privacy mode** — short prompts can be forced local; privacy mode disables all cloud calls.

## CodeQL configuration

CodeQL is enabled for JavaScript / TypeScript only (no Python sidecar fleet in this repo). Default queries plus `security-and-quality` are run on `main` and weekly.
