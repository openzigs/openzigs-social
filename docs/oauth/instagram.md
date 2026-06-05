# Instagram — OAuth walkthrough

openzigs-social connects to Instagram via the **Meta Graph API v25.0**. You create a Meta developer app (BYOK) once and use it for Instagram, Facebook Pages, and Threads. The Onboarding tab has a numbered in-app wizard (`/onboarding` → **Meta app**) that walks you through the developer portal steps and generates the exact scopes and redirect URIs you need — these instructions cover the same ground for reference.

## Prerequisites

- A [Meta developer account](https://developers.facebook.com/) (log in with your Facebook account)
- An **Instagram Business** or **Instagram Creator** account (personal accounts do not have API access)
- The Instagram account must be **linked to a Facebook Page** (required by the Graph API)
- openzigs-social running locally

---

## Step-by-step setup

### 1. Create a Meta app

1. Go to <https://developers.facebook.com/apps/> and click **Create app**.
2. Under **What do you want your app to do?**, choose **Other** → **Next**.
3. App type: choose **Business** → **Next**.
4. Fill in an app display name (e.g. "openzigs-social"), select your developer test account, and click **Create app**.

<!-- screenshot: meta-create-app.png -->

### 2. Add the Instagram product

1. In the app dashboard, scroll to **Add products to your app** and click **Set up** next to **Instagram**.
2. Choose **Instagram Graph API** (not the legacy Basic Display API).

<!-- screenshot: meta-add-instagram-product.png -->

### 3. Configure the Instagram product

1. Go to **Instagram** → **Settings** in the left sidebar.
2. Under **Instagram testers**, click **Add Instagram testers** and invite the Instagram account you want to use (search by handle). The account owner must accept the invite at <https://www.instagram.com/accounts/manage_access/>.

<!-- screenshot: meta-instagram-testers.png -->

### 4. Set up OAuth redirect URIs

1. Go to **App settings** → **Basic** in the left sidebar.
2. Note your **App ID** and **App secret** (click **Show** to reveal the secret).
3. Go to **Facebook Login for Business** → **Settings** (or **Facebook Login** → **Settings**).
4. Under **Valid OAuth Redirect URIs**, add:
   ```
   http://localhost:3000/api/instagram/callback
   http://localhost:3000/api/facebook/callback
   http://localhost:3000/api/threads/callback
   ```
   (all three if you plan to use Meta platforms; they share the same app)
5. Click **Save changes**.

<!-- screenshot: meta-oauth-redirect-uris.png -->

### 5. Request permissions

Go to **App review** → **Permissions and features**. Request the following permissions:

| Permission | Purpose |
|---|---|
| `instagram_basic` | Read the connected Instagram account's profile and media |
| `instagram_content_publish` | Publish photos, videos, carousels, and reels |
| `instagram_manage_comments` | Read and reply to comments |
| `instagram_manage_insights` | Access media and account-level insights |
| `pages_show_list` | Enumerate connected Facebook Pages |
| `pages_read_engagement` | Read page engagement metrics |

For a development / test app, most permissions are granted instantly in sandbox mode. For production, you'll need to submit the app for review.

<!-- screenshot: meta-permissions.png -->

### 6. Paste credentials into openzigs-social

1. Open openzigs-social → **Onboarding** → **Meta app**.
2. Enter the **App ID** and **App secret** from step 4. The secret is stored encrypted and never shown again.
3. The wizard displays the exact scopes and redirect URIs to copy — the values above match what it generates.
4. Click **Connect Instagram** — the browser opens Meta's OAuth dialog. Select your Instagram Business/Creator account and approve.
5. The wizard confirms the connection with your account handle.

<!-- screenshot: openzigs-meta-wizard.png -->

---

## Scopes to request

The authorization URL openzigs-social generates requests:

```
instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,pages_show_list,pages_read_engagement
```

These are comma-separated (Meta's format). The Onboarding Meta app wizard generates and offers a one-click copy of this exact string.

---

## Redirect URI to register

```
http://localhost:3000/api/instagram/callback
```

Register this in **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs**.

---

## Where to configure in openzigs-social

Enable the Meta connector in `config/local.json`:

```json
{
  "platform": {
    "meta": {
      "enabled": true
    }
  }
}
```

The app ID, app secret, and per-account access tokens are stored in the encrypted vault — not in config files.

---

## Common errors

**"Instagram account must be a Business or Creator account"**
Personal Instagram accounts do not have access to the Graph API. Convert the account to Business or Creator in the Instagram app under **Account** → **Switch to professional account**.

**"The redirect_uri does not match"**
The redirect URI sent by openzigs-social doesn't match what's registered in the Meta app. Verify the URI in **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs** is exactly `http://localhost:3000/api/instagram/callback`.

**"Connection needs reconsent" / token expired**
Long-lived Meta tokens expire after 60 days of inactivity. Open the Instagram settings panel and click **Reconnect** to re-run the OAuth flow. The vault entry is updated atomically.

**"App not approved for this permission"**
In development mode, only accounts added as testers can authorize the app. Add your Instagram account as a tester (step 3) or submit the app for Meta app review to unlock production access.
