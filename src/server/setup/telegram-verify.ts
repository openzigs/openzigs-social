/**
 * Minimal Telegram bot verification (setup wizard, sub #104).
 *
 * This is the thin verification path only — NOT the full Telegram channel
 * (approval queue / DM relay) which lands with epic #47. We avoid a heavy
 * dependency and call the Bot API directly with `fetch`:
 *
 *   1. `getMe`       — confirms the bot token is valid, returns the username.
 *   2. `sendMessage` — sends a test message to the admin chat id so the user
 *                      can confirm end-to-end delivery.
 *
 * The bot token is treated as a secret: never logged, never returned.
 */

const TELEGRAM_API = "https://api.telegram.org";

export interface VerifyTelegramInput {
  botToken: string;
  adminChatId: string;
}

export interface VerifyTelegramResult {
  valid: boolean;
  /** Bot username from `getMe`, on success. */
  botUsername?: string;
  /** Human-readable reason on failure. Never contains the token. */
  reason?: string;
}

interface GetMeResponse {
  ok: boolean;
  result?: { username?: string };
  description?: string;
}

interface SendMessageResponse {
  ok: boolean;
  description?: string;
}

type FetchLike = typeof fetch;

const TEST_MESSAGE =
  "✅ openzigs-social is connected. This is a one-time setup verification message.";

/**
 * Verify a bot token and deliver a test message to the admin chat. Transport
 * and API errors resolve to `{ valid: false, reason }` — never throw — so the
 * route can always answer cleanly.
 */
export async function verifyTelegram(
  input: VerifyTelegramInput,
  fetchImpl: FetchLike = fetch
): Promise<VerifyTelegramResult> {
  const token = input.botToken.trim();
  const chatId = input.adminChatId.trim();

  let username: string | undefined;
  try {
    const res = await fetchImpl(`${TELEGRAM_API}/bot${token}/getMe`, { method: "GET" });
    const body = (await res.json().catch(() => ({}))) as GetMeResponse;
    if (!res.ok || !body.ok) {
      return { valid: false, reason: "invalid bot token" };
    }
    username = body.result?.username;
  } catch {
    return { valid: false, reason: "could not reach Telegram" };
  }

  try {
    const res = await fetchImpl(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: TEST_MESSAGE })
    });
    const body = (await res.json().catch(() => ({}))) as SendMessageResponse;
    if (!res.ok || !body.ok) {
      return { valid: false, botUsername: username, reason: "could not send test message" };
    }
  } catch {
    return { valid: false, botUsername: username, reason: "could not reach Telegram" };
  }

  return { valid: true, botUsername: username };
}
