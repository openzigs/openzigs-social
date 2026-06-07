# Community Submission Guide — openzigs-social v0.1.0

This document tracks the directory and community submissions to be made after the v0.1.0 GitHub release is published. These are **post-release actions** — do not submit until the GitHub Release exists at `https://github.com/openzigs/openzigs-social/releases/tag/v0.1.0`.

---

## awesome-selfhosted

**Repository:** https://github.com/awesome-selfhosted/awesome-selfhosted

**Entry format (add to the "Social networks and forums" or "Communication - Social Networks and Forums" section):**

```markdown
- [openzigs-social](https://github.com/openzigs/openzigs-social) - Local-first,
  agentic social media manager with unified inbox, AI auto-reply, content calendar,
  and Telegram remote control. Supports Instagram, Facebook, Threads, LinkedIn,
  Pinterest, TikTok, and X (Twitter). ([Source Code](https://github.com/openzigs/openzigs-social)) `MIT` `Nodejs`
```

**Checklist before submitting a PR:**
- [ ] GitHub release v0.1.0 is published
- [ ] Demo or screenshots are available in the README
- [ ] License badge matches (`MIT`)
- [ ] Docker image is available at `ghcr.io/openzigs/openzigs-social`
- [ ] `docker-compose.yml` is attached to the release

---

## awesome-llm-apps

**Repository:** https://github.com/Shubhamsaboo/awesome-llm-apps

**Entry suggestion (add to the "Social Media / Content" or "AI Agents" section):**

```markdown
| [openzigs-social](https://github.com/openzigs/openzigs-social) | Local-first agentic social media manager — AI auto-reply with brand voice scoring, Telegram bot remote control, unified inbox, analytics. Default LLM: Gemma 4 via Ollama; BYOK for OpenAI / Anthropic. |
```

---

## Product Hunt

**Tagline:** "Local-first AI social media manager with unified inbox & Telegram control"

**Description:**
openzigs-social is a self-hosted, local-first social media manager built for creators and small teams who want full data ownership. Features:
- Unified inbox across Instagram, Facebook, Threads, LinkedIn, Pinterest, TikTok, and X
- AI auto-reply with brand voice scoring (local Gemma 4 via Ollama or BYOK)
- Telegram bot for push notifications and remote approval
- Content calendar with drag-to-reschedule and retry/DLQ
- Light CRM with lead scoring and conversation history
- Weekly analytics digest via Telegram + email

**Links:**
- Product: https://github.com/openzigs/openzigs-social
- GitHub: https://github.com/openzigs/openzigs-social

---

## Hacker News — Show HN

**Title:** `Show HN: openzigs-social – local-first, agentic social media manager (self-hosted, MIT)`

**Body template:**

> I built openzigs-social, a self-hosted, local-first social media manager for creators/small teams.
>
> It runs entirely on your machine (Node 22 + SQLite), uses Gemma 4 via Ollama as the default LLM (or BYOK for OpenAI/Anthropic), and has a Telegram bot for remote control and push notifications.
>
> Key features:
> - Unified inbox across Instagram, Facebook, Threads, LinkedIn, Pinterest, TikTok, X
> - AI auto-reply with brand-voice scoring and human-approval queue
> - Content calendar (drag-to-reschedule), outbox with retry/DLQ
> - Light CRM with cross-platform identity and lead scoring
> - Weekly analytics digest (engagement, posting heatmap, top posts)
> - Encrypted backup/restore with AES-256-GCM
>
> GitHub: https://github.com/openzigs/openzigs-social
> License: MIT

**Best time to post:** Tuesday–Thursday, 9–11 AM ET

---

## Timing

Submit in this order:
1. **GitHub Release** — triggered automatically by `git tag v0.1.0 && git push origin v0.1.0`
2. **Hacker News Show HN** — same day as release, morning ET
3. **Product Hunt** — the day after HN, to capitalize on HN traffic
4. **awesome-selfhosted PR** — within a week of release, after screenshots are polished
5. **awesome-llm-apps PR** — same week as awesome-selfhosted
