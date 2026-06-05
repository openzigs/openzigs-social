# Threads — OAuth walkthrough

openzigs-social connects to **Threads** via the Threads API (a Meta product). Threads uses the **same Meta developer app** as Instagram and Facebook Pages, but requires a separate permission set and a distinct OAuth flow. Create the Meta app first (see [instagram.md](instagram.md) steps 1–4), then follow the steps below.

## Prerequisites

- A Meta developer app (see [instagram.md](instagram.md) steps 1–4)
- A **Threads** account connected to your Instagram account (required by Meta's API)
- Your Instagram account must be Business or Creator
- openzigs-social running locally

> **Note.** Threads is a relatively new API surface — some permissions may require Meta app review for production use. In development mode, testers can authorize the app immediately.

---

## Step-by-step setup

### 1. Enable the Threads API product

1. In the Meta app dashboard, go to **Add products** and click **Set up** next to **Threads API**.
2. Follow the setup prompts. Make sure the Threads redirect URI is registered:
   ```
   http://localhost:3000/api/threads/callback
   ```
   Add this in **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs** (same location as the Instagram and Facebook URIs).

<!-- screenshot: meta-threads-product.png -->

### 2. Add Threads testers (development only)

1. Go to **App roles** → **Testers** and add the Instagram account linked to your Threads account.
2. The tester must accept the invite via the Instagram settings or at <https://www.instagram.com/accounts/manage_access/>.

<!-- screenshot: meta-threads-testers.png -->

### 3. Request Threads permissions

Go to **App review** → **Permissions and features** and request:

| Permission | Purpose |
|---|---|
| `threads_basic` | Read Threads profile and posts |
| `threads_content_publish` | Publish text posts, images, videos, and carousel posts |
| `threads_manage_replies` | Read and reply to replies on your posts |
| `threads_read_replies` | Read replies and conversation threads |
| `threads_manage_insights` | Access post and profile-level insights |

<!-- screenshot: meta-threads-permissions.png -->

### 4. Connect in openzigs-social

1. Open openzigs-social → **Onboarding** → **Connect platforms** → **Threads**.
2. Click **Connect** — the browser opens the Threads OAuth dialog.
3. Approve the requested permissions.
4. The wizard confirms the connection with your Threads handle.

<!-- screenshot: openzigs-threads-connected.png -->

---

## Scopes to request

```
threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies,threads_manage_insights
```

Note the **comma-separated format** — this is specific to the Threads API and differs slightly from how some other Meta products handle scope strings. The Onboarding Meta app wizard generates and offers a one-click copy of this string.

---

## Redirect URI to register

```
http://localhost:3000/api/threads/callback
```

Register this in **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs** alongside the Instagram and Facebook URIs.

---

## Where to configure in openzigs-social

Threads uses the same `platform.meta.enabled` flag as Instagram and Facebook:

```json
{
  "platform": {
    "meta": {
      "enabled": true
    }
  }
}
```

---

## Common errors

**"Threads account not found"**
Your Threads account must be linked to the Instagram account you authorized. Open the Threads app, go to **Settings** → **Account** and verify the account connection.

**"Invalid scope: threads_content_publish"**
The Threads product may not be added to your Meta app, or the permission wasn't requested. Go to **App review** → **Permissions and features** and add the missing Threads permissions.

**"Connection needs reconsent"**
Long-lived Threads tokens expire after 60 days of inactivity (same as all Meta tokens). Click **Reconnect** on the Threads panel to re-run the OAuth flow.

**Posts show as published but aren't appearing on Threads**
New apps in development mode can only post to tester accounts. The Threads post was created (the API returned success) but it may not be visible publicly until the app passes Meta's review for production use.
