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
| Server framework | Express | 4.22 |
| Realtime | Socket.IO | 4.8 |
| Database | better-sqlite3 (WAL) | 12 |
| Logging | Winston | 3 |
| Hardening | helmet | 7 |
| Agent runtime | @github/copilot-sdk | ^0.2.1 |
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

_To be written._

## 4–14. _To be written._
