# User guide

> Living document. Filled in as user-facing features land.

## Table of contents

1. Install
   - Desktop (Tauri) — macOS
   - Desktop (Tauri) — Windows
   - Self-host (docker-compose)
2. First-run setup wizard
   - Choose your LLM (local Ollama / BYOK / Copilot)
   - Connect Telegram for remote control
   - Connect platforms (Twitter/X, LinkedIn, Instagram, Facebook, YouTube, TikTok, Pinterest)
   - Per-user Meta app walkthrough
3. The unified inbox
4. Compose + schedule (calendar view)
5. AI auto-reply with brand voice
   - Brand-voice rulebook
   - Confidence threshold
   - Hybrid posture (auto vs queued)
6. Light CRM (contacts, lead scoring, history)
7. Analytics dashboard
8. Approvals over Telegram
9. Privacy mode
10. Troubleshooting

## 2. First-run setup wizard

(Currently a minimal skeleton — epic #129. The polished, guided onboarding
experience is tracked in #100.)

Open `/setup` in the app. The wizard has three steps and remembers your
progress if you refresh or close the tab:

1. **Welcome** — a short intro. Click **Next** to begin.
2. **AI provider** — pick **OpenAI**, **Anthropic**, or **OpenAI-compatible**,
   then paste your BYOK API key (for OpenAI-compatible, also enter the base
   URL). Click **Validate & save** — the local server checks the key against
   the provider's `/models` endpoint and, on success, stores it encrypted in
   the vault. Your key is never displayed again and never leaves your machine
   beyond that one validation call.
3. **Telegram** — create a bot with [@BotFather](https://t.me/BotFather), then
   enter its **bot token** and your numeric **admin chat id**. Click **Verify &
   save** — the server confirms the bot via `getMe` and sends a one-time test
   message to your admin chat. If it arrives, you're connected.

Only your *progress* is stored in the browser — secrets are held server-side in
the encrypted vault (see §10). Telegram here is a minimal connection check; the
full Telegram control surface is described in §8.

## 4. Connecting Meta accounts + composing

openzigs-social can publish to **Instagram**, **Facebook Pages**, and
**Threads** through the Meta Graph API (epic #53). This is opt-in: the
connectors stay dark until you set `platform.meta.enabled = true` in your
config (see §12) and restart the server. With it off, no Meta network calls are
ever made.

**Connecting an account.** You connect each platform with your own Meta app
(BYOK) — the app id/secret and the per-account access tokens are stored
encrypted in the vault and are never displayed or logged. After completing the
Meta OAuth handshake, the account shows up as connected.

**Check what's connected.** The composer reads `GET /api/connections`, which
reports each platform's status — `connected`, `needsReconsent` (token expired or
revoked), and a label (Instagram / Facebook Pages / Threads). The endpoint never
returns the tokens themselves.

**Compose + pick targets.** Open `/compose`. Under **Publish to** you'll see a
checkbox for each platform. Connected accounts are selectable; accounts that
aren't connected (or need reconnecting) are shown disabled with a hint. Tick the
accounts you want, write your post, and the footer shows exactly where it will
publish.

**Scheduling, the calendar, and the outbox.** The composer's character counter
uses the **strictest** limit of the platforms you picked, so the moment X is a
target the counter caps at 280 and the **Schedule**/**Save draft** buttons stay
disabled until you're under the limit — no rejected posts. Pick a date and time
and hit **Schedule**, and the post is queued (one outbox entry per platform).

- **Calendar (`/calendar`).** Every scheduled post shows as an event. **Drag it
  to a new slot** to reschedule — the new time is saved and the platform never
  changes. The scheduler publishes each post within about a minute of its time.
- **Outbox (`/outbox`).** See the whole queue with live status (scheduled →
  publishing → published). If a publish fails it's retried automatically on a
  **1m → 5m → 30m → 2h** backoff; failed posts are surfaced at the top with the
  error and a **Retry** button. Anything that exhausts all retries lands in the
  **dead-letter queue** so it's never silently lost.

## 5. Connecting LinkedIn, Pinterest & TikTok (Cohort B)

openzigs-social can also publish to **LinkedIn**, **Pinterest**, and **TikTok**
(epic #60). Each is independently opt-in — set the matching flag and restart:

```json
{
  "platform": {
    "linkedin": { "enabled": true },
    "pinterest": { "enabled": true },
    "tiktok": { "enabled": true }
  }
}
```

(or `OPENZIGS_SOCIAL_PLATFORM_LINKEDIN_ENABLED=true`, `…_PINTEREST_ENABLED`,
`…_TIKTOK_ENABLED`). With a flag off, that platform makes no network calls.

As with Meta, you bring your own app (BYOK): LinkedIn client id/secret,
Pinterest app id/secret, TikTok client key/secret, and per-account tokens are
all stored encrypted in the vault and never displayed or logged. After the OAuth
handshake the account appears as connected in the composer's **Publish to** list
alongside the Meta platforms.

### Known limitations

* **LinkedIn — no direct messages.** LinkedIn DM access is gated behind the
  Compliance Partner Program. In v1, LinkedIn supports publishing posts (as a
  member or organization) and reading comments + analytics only — there is no DM
  sending or receiving, and the app refuses any messaging permission scope.
* **TikTok — posts are private until audited.** TikTok requires apps to pass a
  content-posting audit before they may publish publicly. Until then, every
  TikTok video this app publishes is forced to **PRIVATE** (`SELF_ONLY`),
  visible only to the connected account owner. The composer shows a notice
  whenever you select TikTok. Public posting unlocks automatically once your
  app's audit is approved by TikTok — no app changes are needed beyond that
  approval.

## 6. Connecting X / Twitter (Cohort C)

openzigs-social can also publish to **X (Twitter)** via the v2 API (epic #66).
It is opt-in — set the flag, pick your access tier, and restart:

```json
{
  "platform": {
    "twitter": {
      "enabled": true,
      "tier": "basic",
      "dmEnabled": false
    }
  }
}
```

(or `OPENZIGS_SOCIAL_PLATFORM_TWITTER_ENABLED=true`,
`OPENZIGS_SOCIAL_PLATFORM_TWITTER_TIER=basic`,
`OPENZIGS_SOCIAL_PLATFORM_TWITTER_DM_ENABLED=true`). With the flag off, X makes
no network calls and the quota endpoint is not mounted.

As with the other platforms, you bring your own app (BYOK): the X
client id/secret and per-account OAuth tokens are stored encrypted in the vault
and never displayed or logged. The connector uses OAuth 2.0 with PKCE. After the
handshake, X appears as connected in the composer's **Publish to** list.

### Write-quota awareness

X meters **writes** (tweets, replies, and DMs) per month against your access
tier. openzigs-social keeps a local, month-to-date count of every successful
write and surfaces it in the **X write quota** panel. The tier caps (overridable
in config under `platform.twitter.writeQuota`) default to:

| Tier | Monthly write cap |
| --- | --- |
| Free | 1,500 |
| Basic | 50,000 |
| Pro | 1,000,000 |

When usage crosses the warning threshold (80% by default) and again when it hits
the cap, you get a one-time Telegram alert and a live update in the panel. Once
the cap is reached, the app **stops issuing writes** (it fails closed rather than
incurring API overage) until the next month rolls over.

### Known limitations

* **DM is off by default and unavailable on the Free tier.** Direct messaging is
  disabled unless you explicitly set `dmEnabled: true` **and** are on a paid tier
  (Basic or Pro). X gates DM behind paid access, so on Free the app registers no
  DM sender and refuses to send. DM rate limits (15 requests / 15 min, 1,440 /
  24 hr) are enforced automatically.
* **Polling-only inbound.** v1 does not register an X webhook; inbound DMs and
  analytics are gathered by polling.

## 7. The unified inbox

The **Inbox** (`/inbox`) brings every platform's direct messages and comments
into a single, prioritised list so you never have to tab between apps.

* **One list, every platform.** Each conversation row shows a platform badge,
  the contact, a message preview, an unread count, and a priority tag. Threads
  are sorted by priority first (set by your rules — see below) then by recency,
  so the conversations that matter surface at the top.
* **Filters + full-text search.** Use the platform selector to focus on a single
  network, and the search box to full-text search across message bodies. Both
  narrow the list instantly.
* **Reading a thread.** Click a conversation to open it. Direct messages and
  comments are split into separate tabs. Opening a thread marks it read. The
  list updates live as new messages arrive.
* **Replying.** The reply composer enforces the selected platform's character
  limit for the active surface (DM vs comment) before you can send. Replies to
  DM-capable platforms are dispatched through the same DM pipeline used
  elsewhere in the app; comment replies are recorded against the thread.

### Comment rules

Inbox **rules** let you triage incoming comments and DMs automatically. A rule
is a declarative set of conditions (for example: platform is `instagram`, the
body contains "refund", or the author has more than 10,000 followers) paired
with actions: set a **priority**, add **tags**, **flag** the thread, or **route**
it. Rules are evaluated safely — there is no scripting or code execution — and
the highest-priority matching rule wins. **Every rule firing is recorded in an
append-only audit trail**, so you can always see exactly which rule acted on a
message and why.

### Known limitations

* **LinkedIn — no direct messages.** Consistent with the LinkedIn connector
  limitation above, the inbox hides the DM section entirely for LinkedIn
  conversations and shows the note: *"LinkedIn DMs require the Compliance
  Partner Program — not supported in v1."* You can still read and reply to
  LinkedIn comments. The same DM-hidden behaviour applies to other
  comments-only platforms (Threads, YouTube).

## 8. AI auto-reply with brand voice

The **Settings** page (`/settings`) is where you teach the assistant your brand
voice and decide how much it can do on its own. It has three parts.

**Brand voice rulebook.** Describe how you sound and the assistant scores every
draft against it:

* **Tone** — a short descriptor of your voice (e.g. "warm, concise, helpful").
  Words from your tone count **twice as much** as your examples when scoring a
  draft.
* **Banned words** — one phrase per line. These are a hard veto: if a draft
  contains **any** banned phrase, its voice score is forced to **0** and the
  draft is always held back, no matter how confident the model is.
* **Exemplar replies** — one example reply per line. These nudge the score up
  when a draft echoes how you actually write.

Click **Save rulebook** to store it. The rulebook is saved on your machine and
read every time a reply is scored.

**Hybrid posture + thresholds.** The posture card shows whether auto-send is
**on** or **off** and the two thresholds that gate it:

* **Confidence** (default **0.85**) — how sure the model is about the reply.
* **Voice match** (default **0.80**) — how well the draft fits your rulebook.

A draft is **auto-sent only when auto-send is enabled and both scores meet or
exceed their thresholds.** If auto-send is off, every draft is queued for you to
review — a human stays in the loop until you opt out. A draft that just misses a
threshold (say confidence 0.84) is queued with a plain-English reason like
`confidence 0.8499 < 0.85`.

**Decision log.** Every reply the assistant considers — sent or queued — appears
in the decision log with **both** scores (confidence and voice match shown as
percentages), the decision, and any banned-word hits. For a **queued** draft you
can:

* **Edit** the text in place before approving (the row is flagged "human
  override" so you can see you changed it),
* **Approve** to send it as-is or as edited, or
* **Reject** to discard it.

Nothing is ever lost: the log is an append-only record of the prompt, the draft,
the final text, the scores, the decision, the model, and the timestamp. It
survives restarts, is searchable by conversation and time range, and the
underlying data is removed when you exercise your right-to-delete for a contact.

## 8.5 Light CRM — contacts, lead scoring & merging

The **Contacts** page (`/contacts`) turns the people you talk to across every
connected platform into a single, scored, mergeable address book. It builds
automatically from your inbox — there is nothing to import.

### The contact list

Every social contact you've received a message from appears in the list with:

* a **lead-score badge** — `Top`, `High`, `Medium`, or `Low`,
* the **platforms** they reach you on (one badge per linked account), and
* their **engagement in the last 7 days**.

Selecting a contact opens the detail pane on the right.

### How lead scoring works

The score is **deterministic and computed entirely on your machine** — no AI
calls, no data leaves your device. It blends three signals:

* **Engagement frequency** — how many messages they've sent in a sliding window
  (7 days by default), the largest factor.
* **Sentiment** — a simple positive/negative word heuristic over their recent
  messages.
* **Follower count** — their audience size, with diminishing returns so a huge
  account doesn't drown out everything else.

As a rule of thumb, a contact who sends you **30 or more messages in the last 7
days** lands in the **Top** bucket. You can tune the window, targets, and
weights under `crm.leadScore` in your config (see §12).

### Conversation history

The detail pane shows a single **conversation timeline** for the contact, merged
in time order across all of their platforms — so a DM on Instagram and a comment
reply on LinkedIn read as one continuous thread. Inbound and outbound messages
are styled differently so you can follow the back-and-forth at a glance.

### Merging duplicate people

The same person often shows up as separate contacts on different platforms. When
two contacts share an **email address** (discovered from their profile or
messages), they appear in the **Suggested merges** panel as a pair.

Click **Merge** to fold them into one identity. The merge:

* keeps **all** the conversation history from both (nothing is deleted),
* combines their email, follower count, and display name, and
* records the merge so there's an audit trail.

Merges happen instantly and the list updates live. The first contact in a
suggested pair becomes the surviving identity; the other is folded into it.

## 9. Analytics dashboard

The **Analytics** tab turns the metrics your connected platforms report into a
at-a-glance view of what's working. Everything is computed locally from data
already on your machine — opening the tab never makes a live call to a platform,
so it loads instantly.

**Pick a window and a platform.** The pills at the top let you choose a trailing
window — **7, 30, or 90 days** — and optionally narrow to a single platform.
Switching the platform filter is instant: it re-slices data that's already
loaded rather than refetching.

**What you'll see:**

- **KPI row** — total **engagement**, **posts** published (with the average
  engagement per post), **impressions**, and current **followers** for the
  selected window and platform.
- **Engagement over time** — a line chart with one line per platform so you can
  see trends and compare networks at a glance.
- **Posting-time heatmap** — a 7-day × 24-hour grid where darker cells mean you
  posted more in that day/hour slot. Use it to spot when you're most (and least)
  active. Hover a cell for the exact count.
- **Top posts** — your highest-engagement posts in the window, ranked and grouped
  by platform.

The dashboard updates **live**: whenever the nightly roll-up runs (or you
trigger one), the panels refresh on their own — no reload needed.

**Weekly digest.** If you enable analytics, openzigs-social can send you a
**weekly digest** summarising engagement vs. the previous week and your top
posts. The digest goes to **Telegram** (if the bot is connected) and, if you
configure SMTP, **email** as well. The two channels are independent — if one
fails, the other still goes out.

To turn it on and (optionally) configure email delivery:

```json
{
  "analytics": {
    "enabled": true,
    "smtp": {
      "enabled": true,
      "host": "smtp.example.com",
      "port": 587,
      "secure": false,
      "user": "you@example.com",
      "from": "you@example.com",
      "to": "you@example.com"
    }
  }
}
```

Your SMTP **password is never stored in config** — set it in the environment as
`OPENZIGS_SOCIAL_SMTP_PASSWORD`. Email is only attempted when the host, from, and
to addresses are all present; otherwise the digest is Telegram-only.

## 9.5 Onboarding & guided setup

The **Onboarding** tab is a guided polish flow you can run on first launch and
re-launch any time. Every step is optional — skip the ones you don't need — and
your progress is remembered between visits.

- **Local model.** openzigs-social detects whether **Ollama** is running and
  recommends the **Gemma 4** variant that fits your machine's RAM. Pick the
  recommended variant (or override it), then **Use this model**; if it isn't
  downloaded yet, **Pull** fetches it. Prefer a hosted model? Add an OpenAI,
  Anthropic, or OpenAI-compatible key and the matching provider chip lights up.

  > **Ollama version requirement.** The recommended high-RAM model
  > (`gemma4:12b`, selected for ≥ 16 GiB) requires **Ollama ≥ 0.30.5**.
  > If your daemon is older, the Pull button shows an "Update Ollama" prompt
  > with a direct download link instead of attempting the pull. Update via
  > the [official installer](https://ollama.com/download) or, if you installed
  > via Homebrew, run `brew upgrade ollama` once Homebrew ships 0.30.5+.
  > The smaller edge variants (`gemma4:e2b`, `gemma4:e4b`) have no version floor.
- **Connect platforms.** Each platform shows whether its app credentials are
  configured and whether you're connected. **Connect** opens the platform's
  authorization page in a new tab.
- **Meta app.** A numbered, screenshot-backed walkthrough for creating your own
  Meta app so Instagram, Facebook, and Threads use **your** rate limits. Paste
  your **App ID** and **App Secret** — the secret is stored securely and never
  shown again — and the wizard hands back the exact **scopes** (one click to
  copy) and **redirect URIs** to register in the Meta developer console.
- **Starter recipe.** Pick a **creator**, **small-biz**, or **agency** preset to
  seed a sensible brand voice (tone, words to avoid, example posts) plus a
  suggested set of platforms and a posting cadence.
- **Brand voice.** Paste or upload examples of your writing (JSON or CSV); replies
  learn your tone from these.

**Contextual tour.** The first time you open the **Inbox**, **Calendar**, and
**Settings** (brand voice) screens, a short coach-mark explains what each does.
Dismiss it with **Got it**; it stays hidden until you press **Re-launch tour**
from the Onboarding tab.

## 10. Approvals over Telegram

Once a bot is connected and the channel is enabled, Telegram becomes your
remote control. The bot is **deny-by-default**: it only obeys your configured
admin chat and ignores everyone else.

Enable it in config:

```json
{ "telegram": { "enabled": true } }
```

(or `OPENZIGS_SOCIAL_TELEGRAM_ENABLED=true`). The channel starts with the
server; if credentials are missing it simply stays off and the server still
runs. Full setup steps live in [docs/TELEGRAM_SETUP.md](TELEGRAM_SETUP.md).

**Commands:** `/start`, `/status`, `/privacy`, `/queue`, and
`/dm <platform> <recipient> <message>`.

**Approving actions:** when something needs sign-off, the bot sends a message
with ✅ Approve / ❌ Reject buttons. Tapping one settles the request and the
message updates to show the outcome (Approved / Rejected / Timed out). `/queue`
lists everything still pending.

**DM relay:** `/dm` sends a direct message as you on a connected platform. Until
a social platform is connected, the bot reports that DM delivery is unavailable
rather than faking a send.

## 11. Privacy mode

Three modes:

* **off** — smart router is free to escalate long prompts to your
  configured cloud provider (OpenAI / Anthropic / OpenAI-compatible).
  Short prompts (≤ 4 096 estimated tokens by default) always stay local.
* **session** — every prompt in the current process routes to your local
  Ollama / Gemma 4 instance. Existing sessions switch on the next turn.
  Cloud providers stay configured but unused.
* **global** — persistent kill-switch. Cloud providers refuse to be
  constructed at all; the smart router can only see your local provider.
  Use this when you must guarantee no prompt ever leaves the host.

Switch modes from the UI privacy panel or programmatically via
`wrapper.setPrivacyMode("session" | "global" | "off")`.

## 12. Where are my credentials stored?

In an encrypted vault at `~/.openzigs-social/auth.json` (file mode
`0o600`, parent directory `0o700`). The vault uses AES-256-GCM envelope
encryption with a key derived from your machine identifier. All API keys,
OAuth refresh tokens, and per-provider settings live there — nothing is
ever written to disk in plaintext.

## 13. Where is my data, and how do I configure it?

Everything openzigs-social writes lives under a single data directory:

* **Default:** `~/.openzigs-social/`
* **Override:** set the `OPENZIGS_SOCIAL_HOME` environment variable to point
  somewhere else (the sandboxed macOS app uses this automatically).

That directory holds the SQLite database (`openzigs-social.db`), the
credential vault (`auth.json`), your config overlay (`user.json`), rotating
logs (`logs/`), the audit log (`audit/audit.jsonl`), and chat transcripts
(`sessions/`).

Configuration is layered, with each layer overriding the one before it:

1. Built-in defaults (`config/default.json`)
2. Your overlay at `<dataDir>/user.json`
3. Environment variables

Supported environment overrides:

| Variable | Setting | Example |
|---|---|---|
| `OPENZIGS_SOCIAL_SERVER_HOST` | Bind address | `127.0.0.1` |
| `OPENZIGS_SOCIAL_SERVER_PORT` | HTTP/Socket.IO port (`0` = OS-assigned) | `3000` |
| `OPENZIGS_SOCIAL_UI_ORIGIN` | Allowed UI origin (CORS) | `http://localhost:3001` |
| `OPENZIGS_SOCIAL_LOG_LEVEL` | `error` / `warn` / `info` / `debug` | `info` |
| `OPENZIGS_SOCIAL_LOG_TO_FILE` | Write rotating log files | `true` / `false` |
| `OPENZIGS_SOCIAL_PRIVACY_MODE` | `off` / `session` / `global` | `session` |

### HTTP endpoints

The server exposes a few operational endpoints (bound to
`OPENZIGS_SOCIAL_SERVER_HOST:PORT`):

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness — `200` with `{ status, uptimeMs }`. |
| `GET /ready` | Readiness — `200`/`503` with per-dependency `checks`. |
| `GET /api/metrics` | Per-platform counters as a flat JSON envelope. |
| `POST /api/setup/validate-key` | Validate + store a BYOK provider key. |
| `POST /api/setup/telegram/verify` | Verify + store a Telegram bot connection. |
| `GET /api/setup/status` | First-run setup completion status. |

`GET /api/metrics` returns JSON (not Prometheus plain-text):

```json
{
  "timestamp": "2026-05-29T00:00:00.000Z",
  "metrics": {
    "twitter": { "sent": 3, "received": 12, "failed": 0 }
  }
}
```

The same `metrics` snapshot is pushed to connected UIs over Socket.IO as a
`metrics:update` event whenever a counter changes.

## 14. Troubleshooting

### "Ollama unreachable" warning on launch

The wrapper probes `http://localhost:11434/api/tags`. If Ollama isn't
running, the app falls back to whichever BYOK provider you have
configured. Start Ollama (`ollama serve`) and either install a Gemma 4
variant manually (`ollama pull gemma4:e2b`) or accept the in-app prompt
on next launch.

### Pull says "Your local Ollama is out of date"

The onboarding Model panel showed this message when you clicked **Pull** for
`gemma4:12b` (the default for machines with ≥ 16 GiB RAM). This model requires
**Ollama ≥ 0.30.5** — older daemons reject the pull with an HTTP 412.

To fix:
1. Download the latest Ollama from <https://ollama.com/download> and run the
   installer, **or** if you installed via Homebrew run `brew upgrade ollama`
   (available once Homebrew publishes the 0.30.5 bottle).
2. Restart the Ollama daemon (`brew services restart ollama` or reopen the
   Ollama desktop app).
3. Return to the Onboarding tab and click **Pull** again.

Alternatively, switch to a smaller edge variant (`gemma4:e4b` for 8–16 GiB,
`gemma4:e2b` for < 8 GiB) — these have no version floor and run on any current
Ollama release.

### A platform connector says "needs reconsent"

Your OAuth refresh token has hard-expired. Open the affected platform
panel and walk through the re-auth flow; the vault entry is updated
atomically on success.


## 2–10. _To be written._
