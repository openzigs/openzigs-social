# Twitter / X — OAuth walkthrough

openzigs-social connects to X (Twitter) via the **v2 API** using **OAuth 2.0 with PKCE**. You bring your own developer app (BYOK): the app credentials are stored encrypted in your local vault, and every API call is metered against your account's monthly write quota.

## Prerequisites

- A [Twitter / X developer account](https://developer.twitter.com/) (free sign-up)
- An X user account at **Basic tier or above** if you need direct-message support (Free tier can publish tweets but cannot send DMs)
- openzigs-social running locally (`pnpm dev` or `pnpm start`)

> **Cost model.** X APIs are usage-billed to the developer account that owns the app. You pay X directly for any API usage beyond the free monthly write allowance. openzigs-social tracks your month-to-date write credits and warns you at 80% capacity — see [User Guide §6](../USER_GUIDE.md#6-connecting-x--twitter-cohort-c).

---

## Step-by-step setup

### 1. Sign in to the developer portal

Go to <https://developer.twitter.com/en/portal/dashboard> and sign in with your X account.

<!-- screenshot: twitter-dev-portal-dashboard.png -->

### 2. Create a project and app

1. Click **+ Add App** (or **New Project** if you don't have one yet).
2. Choose a project name (e.g. "openzigs-social") and an environment (`Development`).
3. On the app creation screen, choose **User Authentication Settings** and proceed.

<!-- screenshot: twitter-create-app.png -->

### 3. Configure user authentication

On the **User authentication settings** page:

1. **App permissions** — select **Read and write** (required for publishing tweets). Enable **Direct message** only if you need DM support and have a paid tier.
2. **Type of app** — choose **Web App, Automated App or Bot**.
3. **Callback URI / Redirect URL** — enter:
   ```
   http://localhost:3000/api/twitter/callback
   ```
4. **Website URL** — enter any valid URL (e.g. `http://localhost:3000`).
5. Click **Save**.

<!-- screenshot: twitter-auth-settings.png -->

### 4. Retrieve your app credentials

1. Navigate to **Keys and tokens** for your app.
2. Under **OAuth 2.0 Client ID and Client Secret**, click **Regenerate** (or copy if already generated).
3. Copy the **Client ID** and **Client Secret**.

> Keep these values secret. Anyone with them can make API calls under your developer account.

<!-- screenshot: twitter-keys-tokens.png -->

### 5. Paste into openzigs-social

1. Open the openzigs-social UI at `http://localhost:3001`.
2. Go to **Onboarding** → **Connect platforms** → **Twitter / X**.
3. Paste the **Client ID** and **Client Secret**.
4. Click **Connect** — the browser opens X's authorization page. Log in as the account you want to publish from and approve the permissions.
5. The wizard confirms the connection and shows the account handle.

<!-- screenshot: openzigs-twitter-connected.png -->

---

## Scopes to request

openzigs-social requests these scopes during the OAuth flow automatically — they are embedded in the generated authorization URL:

| Scope | Purpose |
|---|---|
| `tweet.read` | Read tweets and timelines |
| `tweet.write` | Post tweets and replies |
| `users.read` | Look up user profile (for the account handle) |
| `offline.access` | Issue a refresh token so you don't need to reconnect every hour |

If `dmEnabled: true` is set in config, `dm.read` and `dm.write` are added automatically.

---

## Redirect URI to register

```
http://localhost:3000/api/twitter/callback
```

Enter this exactly (no trailing slash) in the **Callback URI** field in your app's User Authentication Settings.

---

## Where to configure in openzigs-social

Enable the connector and choose your tier in `config/local.json` (or the `user.json` overlay):

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

Valid values for `tier`: `"free"` / `"basic"` / `"pro"`.

---

## Common errors

**"Authorization callback URL mismatch"**
The redirect URI registered in the X developer portal doesn't exactly match what openzigs-social sends. Double-check the callback URI in the portal is `http://localhost:3000/api/twitter/callback` — no trailing slash, exact casing.

**"Connection needs reconsent" / token expired**
X OAuth 2.0 refresh tokens can expire if unused for 6+ months or if the user revokes access. Open the Twitter / X settings panel and click **Reconnect** to re-run the OAuth flow. Your vault entry is updated atomically on success.

**Tweet quota exceeded**
The monthly write cap for your tier has been reached. openzigs-social stops issuing writes (fails closed) and sends a one-time Telegram alert. The counter resets at the start of the next calendar month UTC. Check current usage in the **X write quota** panel on `/settings`.

**"DM requires paid tier"**
Direct messages are gated behind X's paid access. Free-tier apps cannot send DMs even with `dmEnabled: true`. Upgrade to Basic or Pro and update `tier` in your config.
