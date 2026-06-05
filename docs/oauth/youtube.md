# YouTube — OAuth walkthrough

openzigs-social connects to **YouTube** via the **YouTube Data API v3** using OAuth 2.0. You create a Google Cloud project (BYOK), enable the API, and configure an OAuth consent screen. Note the daily quota: YouTube grants each project 10,000 units per day (reads cost 1 unit, writes cost 50 units).

## Prerequisites

- A [Google account](https://accounts.google.com/) with access to [Google Cloud Console](https://console.cloud.google.com/)
- A **YouTube channel** linked to your Google account
- openzigs-social running locally

---

## Step-by-step setup

### 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in.
2. Click the project selector at the top, then **New project**.
3. Enter a project name (e.g. "openzigs-social") and click **Create**.

<!-- screenshot: gcp-new-project.png -->

### 2. Enable the YouTube Data API v3

1. With your new project selected, go to **APIs & Services** → **Library**.
2. Search for "YouTube Data API v3" and click on it.
3. Click **Enable**.

<!-- screenshot: gcp-enable-youtube-api.png -->

### 3. Configure the OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (for personal accounts) or **Internal** (if using Google Workspace).
3. Fill in the **App name**, **User support email**, and **Developer contact information**.
4. On the **Scopes** step, click **Add or remove scopes** and add:
   - `https://www.googleapis.com/auth/youtube.force-ssl`
5. On the **Test users** step, add the Google account that owns the YouTube channel you want to connect (only needed while the app is in testing mode).
6. Click **Save and continue** to finish.

<!-- screenshot: gcp-oauth-consent-screen.png -->

> **Force-approval prompt.** The `youtube.force-ssl` scope is sensitive and will trigger a "This app isn't verified" warning screen during OAuth. Click **Advanced** → **Go to \<app name\> (unsafe)** to proceed in testing mode. For production use, submit the app for Google verification.

### 4. Create OAuth credentials

1. Go to **APIs & Services** → **Credentials**.
2. Click **+ Create credentials** → **OAuth client ID**.
3. Choose **Web application** as the application type.
4. Under **Authorized redirect URIs**, click **+ Add URI** and enter:
   ```
   http://localhost:3000/api/youtube/callback
   ```
5. Click **Create**.
6. Copy the **Client ID** and **Client secret** from the dialog.

<!-- screenshot: gcp-oauth-credentials.png -->

### 5. Paste into openzigs-social

1. Open openzigs-social → **Onboarding** → **Connect platforms** → **YouTube**.
2. Enter the **Client ID** and **Client secret**.
3. Click **Connect** — the browser opens Google's OAuth dialog. Sign in with the Google account that owns the YouTube channel, approve the permissions (expect the "app not verified" warning in testing mode).
4. The wizard confirms the connection with your YouTube channel name.

<!-- screenshot: openzigs-youtube-connected.png -->

---

## Scopes to request

| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/youtube.force-ssl` | Read and write YouTube data over HTTPS (comments, video metadata, analytics) |

---

## Redirect URI to register

```
http://localhost:3000/api/youtube/callback
```

Register this under **APIs & Services** → **Credentials** → your OAuth client → **Authorized redirect URIs**.

---

## Where to configure in openzigs-social

YouTube does not require a separate enable flag — the connector activates once credentials are added via the OAuth flow. The daily quota tracker is always active when YouTube is connected.

---

## Understanding the daily quota

The YouTube Data API v3 allocates **10,000 units per day** per Google Cloud project, resetting at midnight Pacific time (not UTC).

| Operation | Cost |
|---|---|
| `list` (read) | 1 unit |
| `insert` / `update` (write — e.g. post a comment) | 50 units |

openzigs-social tracks your daily usage in the `youtube_quota_usage` table and surfaces the current count in the **YouTube quota** widget on `/settings`. When usage reaches ≥ 80%, you receive a one-time Telegram alert. Write operations that would exceed the daily limit are queued to the next UTC day instead of failing — check the outbox for any queued items.

---

## Common errors

**"Access blocked: This app's request is invalid"**
The redirect URI in Google Cloud Console doesn't match. Verify it is exactly `http://localhost:3000/api/youtube/callback` under **Credentials** → your OAuth client → **Authorized redirect URIs**.

**"YouTube Data API v3 has not been used in project… before"**
The API isn't enabled. Go to **APIs & Services** → **Library**, find YouTube Data API v3, and click **Enable**.

**"Connection needs reconsent" / token expired**
Google refresh tokens can expire if the OAuth consent screen is in testing mode and the token hasn't been used for 7 days, or after 6 months unconditionally. Click **Reconnect** on the YouTube panel to re-run the OAuth flow. Publishing the app on the consent screen removes the 7-day expiry.

**Daily quota exhausted — writes are queued**
You've used all 10,000 units for today. openzigs-social automatically defers write operations to tomorrow rather than failing them. The **YouTube quota** widget on `/settings` shows remaining capacity. The quota resets at midnight Pacific time (not midnight UTC).
