# Pinterest — OAuth walkthrough

openzigs-social connects to **Pinterest** via the Pinterest API v5 using OAuth 2.0. You create a Pinterest developer app (BYOK) and use it to publish Pins and read analytics.

## Prerequisites

- A [Pinterest developer account](https://developers.pinterest.com/) (sign in with your Pinterest account)
- A **Pinterest business account** (required for Ad Account permissions and analytics; convert at <https://help.pinterest.com/en/business/article/get-a-business-account>)
- openzigs-social running locally

---

## Step-by-step setup

### 1. Create a Pinterest app

1. Go to <https://developers.pinterest.com/apps/> and click **Connect app**.
2. Fill in the **App name** (e.g. "openzigs-social"), **Description**, and agree to the terms.
3. Click **Create app**.

<!-- screenshot: pinterest-create-app.png -->

### 2. Configure your app

1. On the app page, go to **App details**.
2. Add a **Redirect URI**:
   ```
   http://localhost:3000/api/pinterest/callback
   ```
3. Click **Save**.

<!-- screenshot: pinterest-app-settings.png -->

### 3. Request Ad Account permissions (for full analytics)

Pinterest gates some analytics endpoints behind **Ad Account** permissions:

1. On the app page, click **Request** next to **Ad account management** if you need full analytics access.
2. For basic publishing and board/pin reading, standard app permissions are sufficient.

<!-- screenshot: pinterest-permissions.png -->

### 4. Copy app credentials

On the app page, copy the **App ID** (client id) and **App secret key** (client secret).

<!-- screenshot: pinterest-credentials.png -->

### 5. Paste into openzigs-social

1. Open openzigs-social → **Onboarding** → **Connect platforms** → **Pinterest**.
2. Enter the **App ID** and **App secret key**.
3. Click **Connect** — the browser opens Pinterest's OAuth dialog. Log in as the Pinterest account you want to use and approve the permissions.
4. The wizard confirms the connection with your Pinterest account name.

<!-- screenshot: openzigs-pinterest-connected.png -->

---

## Scopes to request

| Scope | Purpose |
|---|---|
| `boards:read` | Read the user's boards |
| `pins:read` | Read the user's pins |
| `pins:write` | Create and update pins |
| `user_accounts:read` | Read the user's account information |
| `ads:read` | Read Ad Account analytics (requires Ad Account permission approval) |

---

## Redirect URI to register

```
http://localhost:3000/api/pinterest/callback
```

Add this in the app's **App details** → **Redirect URIs**.

---

## Where to configure in openzigs-social

```json
{
  "platform": {
    "pinterest": {
      "enabled": true
    }
  }
}
```

Or via environment variable: `OPENZIGS_SOCIAL_PLATFORM_PINTEREST_ENABLED=true`.

---

## Common errors

**"Invalid redirect_uri"**
The redirect URI registered in the Pinterest developer portal doesn't match what openzigs-social sends. Verify the URI is exactly `http://localhost:3000/api/pinterest/callback` (no trailing slash) in **App details** → **Redirect URIs**.

**"Insufficient permissions to access this endpoint"**
The analytics endpoint requires Ad Account permissions, which need to be requested separately. See step 3. For basic publishing, ensure `pins:write` is in the scope.

**"Connection needs reconsent" / token expired**
Pinterest refresh tokens expire after 1 year of inactivity. Click **Reconnect** on the Pinterest panel to re-run the OAuth flow.

**Pin published but not appearing on the board**
Pinterest may take a few minutes to index newly created pins. If the pin is missing after 5 minutes, check the **Outbox** for errors — Pinterest's API returns `200` for some transient failures that are only visible in the error envelope (`error_response.code`).
