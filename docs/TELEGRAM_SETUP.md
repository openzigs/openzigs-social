# Telegram setup

openzigs-social uses a Telegram bot as its **only** push-notification and
remote-control channel. You approve or reject pending actions, review the
approval queue, and send DMs "as yourself" — all from a private chat with your
bot. The channel is **opt-in** and **deny-by-default**: it obeys only the admin
chat(s) you configure and ignores everyone else.

## 1. Create a bot

1. In Telegram, open a chat with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts to choose a name and username.
3. BotFather replies with a **bot token** like `123456789:AA...`. Keep it
   secret — anyone with the token controls the bot.

## 2. Find your admin chat id

1. Start a chat with your new bot and send it any message.
2. Get your numeric chat id (e.g. via [@userinfobot](https://t.me/userinfobot)).
   This id is the **only** chat the bot will obey.

## 3. Store the credentials

The bot token and admin chat id are stored **encrypted** in the local
credential vault (`~/.openzigs-social/auth.json`, AES-256-GCM, file mode
`0600`) — never in config files or logs. Use the setup wizard
(`/setup` in the UI) to enter and verify them; verification sends a one-time
test message to your admin chat.

## 4. Enable the channel

The non-secret runtime switches live in config (`config/default.json` or your
`user.json`):

```json
{
  "telegram": {
    "enabled": true,
    "mode": "polling",
    "approvalTimeoutMs": 0,
    "adminChatIds": []
  }
}
```

| Field | Meaning |
|---|---|
| `enabled` | Master on/off switch. Default `false`. |
| `mode` | Transport. Only `"polling"` is wired in v1. |
| `approvalTimeoutMs` | Auto-decision timeout in ms. `0` = wait indefinitely for a human. |
| `adminChatIds` | **Extra** admin chat ids beyond the vault's primary admin. |

Equivalent environment overrides: `OPENZIGS_SOCIAL_TELEGRAM_ENABLED=true`,
`OPENZIGS_SOCIAL_TELEGRAM_MODE=polling`.

The channel starts with the server when `enabled` is `true` and vault
credentials exist. If anything is missing or fails, the server still starts —
the Telegram channel simply stays off.

## 5. Commands

| Command | Description |
|---|---|
| `/start` | Greeting + command overview. |
| `/status` | Channel status: pending approval count, DM-relay availability. |
| `/privacy` | What the bot can see and store (local-first, encrypted, ACL). |
| `/queue` | Review pending approvals with inline Approve/Reject buttons. |
| `/dm <platform> <recipient> <message>` | Send a direct message as you on a connected platform. |

## 6. Approving actions

When an action needs your sign-off, the bot pushes a message with **✅ Approve**
and **❌ Reject** buttons to your admin chat. Tapping a button settles the
request; the message is then edited to show the outcome (`✅ Approved`,
`❌ Rejected`, or `⌛ Timed out`). You can also tap a button later from
`/queue`.

## 7. DM relay

`/dm instagram @alice hey there` relays a direct message on the named platform.
DM delivery requires a connected social platform; until one is connected the
bot replies that DM delivery is unavailable (it never silently drops or fakes a
send).

## Security notes

- The bot is **deny-by-default**: non-admin chats get no reply at all — the bot
  does not even confirm it exists.
- The bot token and admin chat id never appear in logs (secret redaction).
- openzigs-social runs locally; approval decisions and DM relays are recorded
  in the local audit log only.
