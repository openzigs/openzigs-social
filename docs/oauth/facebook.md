# Facebook Pages — OAuth walkthrough

openzigs-social publishes to **Facebook Pages** and reads page insights via the Meta Graph API. Facebook Pages shares the same Meta developer app as Instagram and Threads — you only need to create the app once. Follow [docs/oauth/instagram.md](instagram.md) steps 1–4 to create the app and register redirect URIs, then continue here.

## Prerequisites

- A Meta developer account and a Meta app (see [instagram.md](instagram.md) steps 1–4)
- A **Facebook Page** that you administer (personal profiles are not supported)
- The Page must be linked to your Facebook account (you are a Page admin)
- openzigs-social running locally

---

## Step-by-step setup

### 1. Add the Facebook Login product (if not already added)

1. In the Meta app dashboard, go to **Add products** and click **Set up** next to **Facebook Login for Business**.
2. Under **Settings**, add the redirect URI:
   ```
   http://localhost:3000/api/facebook/callback
   ```
3. Click **Save changes**.

<!-- screenshot: meta-fb-login-settings.png -->

### 2. Request required permissions

Go to **App review** → **Permissions and features** and ensure the following are requested:

| Permission | Purpose |
|---|---|
| `pages_show_list` | Enumerate the Pages you manage |
| `pages_read_engagement` | Read comments and post metrics |
| `pages_manage_posts` | Publish posts to a Page |
| `pages_manage_engagement` | Reply to comments |
| `read_insights` | Access Page-level insights |

In development mode these are available immediately to tester accounts; production access requires Meta app review.

<!-- screenshot: meta-fb-permissions.png -->

### 3. Connect in openzigs-social

1. Open openzigs-social → **Onboarding** → **Connect platforms** → **Facebook Pages**.
2. Click **Connect** — the browser opens Meta's OAuth dialog.
3. Select the Pages you want to connect and approve the permissions.
4. The wizard lists the connected Pages and confirms the connection.

<!-- screenshot: openzigs-fb-connected.png -->

---

## Scopes to request

```
pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,read_insights
```

---

## Redirect URI to register

```
http://localhost:3000/api/facebook/callback
```

Register this in **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs** (alongside the Instagram and Threads URIs — they share the same form).

---

## Where to configure in openzigs-social

Facebook Pages uses the same `platform.meta.enabled` flag as Instagram:

```json
{
  "platform": {
    "meta": {
      "enabled": true
    }
  }
}
```

The Page access tokens are stored encrypted in the vault alongside your app credentials.

---

## Common errors

**"I don't see my Page in the authorization dialog"**
Only Pages where your account has **Admin** or **Editor** role are shown. Verify your role at `https://www.facebook.com/<page-name>/settings/?tab=admin_roles`.

**"Pages access token expired"**
Page access tokens derived from a short-lived user token expire quickly. openzigs-social stores a long-lived token but it can still expire after 60 days of inactivity. Click **Reconnect** on the Facebook Pages panel to refresh.

**"Missing required permission: pages_manage_posts"**
The app is in development mode and the Meta account used for the OAuth flow is not listed as a tester. Add the account as a tester in **App roles** → **Testers**, or submit the app for production review.

**Posts appear under my personal profile, not the Page**
This usually means the wrong token was selected during the OAuth flow. Disconnect and reconnect, ensuring you tick the correct Page in Meta's permission selector.
