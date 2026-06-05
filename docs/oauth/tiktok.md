# TikTok — OAuth walkthrough

openzigs-social connects to **TikTok** via the TikTok for Developers API using OAuth 2.0. You create a TikTok developer app (BYOK) and go through TikTok's sandbox → production approval path.

> **v1 limitation — posts are private until audited.** Until your app passes TikTok's content-posting audit, every video openzigs-social publishes is forced to **PRIVATE** (`SELF_ONLY`) — visible only to the connected account owner. The composer shows a notice whenever TikTok is selected as a publish target. Public posting unlocks automatically once your app's audit is approved by TikTok — no code changes are needed on the openzigs-social side.

## Prerequisites

- A [TikTok developer account](https://developers.tiktok.com/) (sign in with your TikTok account or create a separate developer account)
- A **TikTok personal or creator account** to connect for publishing
- openzigs-social running locally

---

## Step-by-step setup

### 1. Create a TikTok app

1. Go to <https://developers.tiktok.com/apps/> and click **Manage apps** → **Create app**.
2. Fill in the **App name** (e.g. "openzigs-social"), select **Platform** as **Web**, and choose a **Category** (e.g. "Productivity").
3. Click **Save**.

<!-- screenshot: tiktok-create-app.png -->

### 2. Add products to the app

1. In the app settings, go to **Add products**.
2. Add **Login Kit** (required for OAuth) and **Content Posting API** (required for publishing).

<!-- screenshot: tiktok-add-products.png -->

### 3. Configure redirect URI

1. In **Login Kit** → **Settings**, find **Redirect domain**.
2. Add:
   ```
   localhost
   ```
   (TikTok's sandbox accepts `localhost` as a redirect domain; the full callback URL is `http://localhost:3000/api/tiktok/callback`)
3. Under **Redirect URL**, enter:
   ```
   http://localhost:3000/api/tiktok/callback
   ```

<!-- screenshot: tiktok-redirect-uri.png -->

### 4. Request Content Posting API permissions

1. In **Content Posting API** → **Settings**, request the following scopes:
   - `video.publish` — publish videos to TikTok
   - `video.list` — read the user's video list (for analytics)
   - `user.info.basic` — read the user's profile (for display)

<!-- screenshot: tiktok-permissions.png -->

### 5. Copy app credentials

In the app settings, copy the **Client key** and **Client secret**.

<!-- screenshot: tiktok-credentials.png -->

### 6. Paste into openzigs-social

1. Open openzigs-social → **Onboarding** → **Connect platforms** → **TikTok**.
2. Enter the **Client key** and **Client secret**.
3. Click **Connect** — the browser opens TikTok's OAuth dialog. Log in as the TikTok account you want to use and approve the requested permissions.
4. The wizard confirms the connection. Note the private-only posting notice.

<!-- screenshot: openzigs-tiktok-connected.png -->

---

## Scopes to request

| Scope | Purpose |
|---|---|
| `user.info.basic` | Read the authenticated user's profile (username, avatar) |
| `video.publish` | Publish videos to TikTok |
| `video.list` | Read the user's posted videos (for analytics) |

---

## Redirect URI to register

```
http://localhost:3000/api/tiktok/callback
```

Register this under **Login Kit** → **Redirect URL**. Also add `localhost` as an allowed **Redirect domain** in the Login Kit settings.

---

## Where to configure in openzigs-social

```json
{
  "platform": {
    "tiktok": {
      "enabled": true
    }
  }
}
```

Or via environment variable: `OPENZIGS_SOCIAL_PLATFORM_TIKTOK_ENABLED=true`.

---

## Production approval path

1. **Sandbox (current)** — all posts are forced private. The app is in sandbox mode. Only the account listed as a sandbox user can authorize and test.
2. **Submit for audit** — once you're satisfied with your integration, go to the app settings and click **Submit for review**. TikTok reviews the content-posting use case. This typically takes 2–4 weeks.
3. **Production** — once approved, the app can post publicly. No changes to openzigs-social are needed; the `SELF_ONLY` restriction is removed automatically by TikTok's API once your app is approved.

---

## Common errors

**"Invalid client_key"**
The Client key entered in openzigs-social doesn't match the one in the TikTok developer portal. Double-check the **Client key** (not the Client secret) on the app settings page.

**"Redirect URI not allowed"**
The redirect URI isn't registered. Verify that `http://localhost:3000/api/tiktok/callback` is listed under **Login Kit** → **Redirect URL** and that `localhost` is in the **Redirect domain** list.

**"Connection needs reconsent" / token expired**
TikTok access tokens expire after 24 hours; refresh tokens expire after 365 days. If the refresh token has expired, click **Reconnect** on the TikTok panel to re-run the OAuth flow.

**Videos are posting as private even after production approval**
Check that TikTok has actually approved your app's production access in the developer portal. Until the approval email arrives and the app status changes to "Approved", all posts remain private.
