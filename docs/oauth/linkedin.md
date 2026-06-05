# LinkedIn — OAuth walkthrough

openzigs-social connects to **LinkedIn** via the LinkedIn REST API using OAuth 2.0. You create a LinkedIn developer app (BYOK) and use it to publish posts on behalf of a member or organization. 

> **v1 limitation — no direct messages.** LinkedIn DM access requires the gated **Compliance Partner Program**. openzigs-social v1 supports post publishing, comment reading, and analytics only — there is no DM sending or receiving, and the app refuses any messaging permission scope. The inbox shows LinkedIn comments but hides the DM section entirely.

## Prerequisites

- A [LinkedIn developer account](https://www.linkedin.com/developers/) (sign in with any LinkedIn account)
- A **LinkedIn Company Page** if you want to publish on behalf of an organization (for member posts, any account works)
- openzigs-social running locally

---

## Step-by-step setup

### 1. Create a LinkedIn app

1. Go to <https://www.linkedin.com/developers/apps/new> and sign in.
2. Fill in the **App name** (e.g. "openzigs-social"), select your **LinkedIn Company Page** (or create one), upload an app logo, and check the legal agreement.
3. Click **Create app**.

<!-- screenshot: linkedin-create-app.png -->

### 2. Verify the app with your Page

LinkedIn requires you to verify your app is associated with a Company Page:

1. On the app settings page, go to the **Settings** tab.
2. Click **Verify** next to your Company Page name and follow the verification prompts (LinkedIn sends a verification request to Page admins).

<!-- screenshot: linkedin-verify-page.png -->

### 3. Request OAuth 2.0 scopes

1. On the app settings page, go to **Products** tab.
2. Click **Request access** for the **Share on LinkedIn** product (grants `w_member_social`).
3. Optionally request **Marketing Developer Platform** for organization posting (`w_organization_social`) — this requires a separate approval.

<!-- screenshot: linkedin-request-products.png -->

### 4. Configure OAuth redirect URI

1. Go to the **Auth** tab on your app settings page.
2. Under **OAuth 2.0 settings**, find **Authorized redirect URLs for your app**.
3. Click **Add redirect URL** and enter:
   ```
   http://localhost:3000/api/linkedin/callback
   ```
4. Click **Update**.

<!-- screenshot: linkedin-oauth-redirect.png -->

### 5. Copy app credentials

On the **Auth** tab, copy your **Client ID** and **Client Secret**.

<!-- screenshot: linkedin-credentials.png -->

### 6. Paste into openzigs-social

1. Open openzigs-social → **Onboarding** → **Connect platforms** → **LinkedIn**.
2. Enter the **Client ID** and **Client Secret**.
3. Click **Connect** — the browser opens LinkedIn's OAuth dialog. Log in as the account you want to publish from and approve the requested permissions.
4. The wizard confirms the connection with your LinkedIn profile name.

<!-- screenshot: openzigs-linkedin-connected.png -->

---

## Scopes to request

| Scope | Purpose |
|---|---|
| `w_member_social` | Publish posts and comments as a LinkedIn member |
| `r_basicprofile` | Read the authenticated user's name and profile (for display) |
| `r_organization_social` | Read organization posts and comments (if publishing as an organization) |
| `w_organization_social` | Publish posts as a LinkedIn organization (requires Marketing Developer Platform approval) |

For a personal member setup, `w_member_social` and `r_basicprofile` are sufficient.

---

## Redirect URI to register

```
http://localhost:3000/api/linkedin/callback
```

Register this under **Auth** → **Authorized redirect URLs for your app**.

---

## Where to configure in openzigs-social

```json
{
  "platform": {
    "linkedin": {
      "enabled": true
    }
  }
}
```

Or via environment variable: `OPENZIGS_SOCIAL_PLATFORM_LINKEDIN_ENABLED=true`.

---

## Common errors

**"This app does not have permission to post on LinkedIn"**
The `w_member_social` scope wasn't granted. On the **Products** tab, request access to **Share on LinkedIn** and wait for approval (usually instant for basic member posting).

**"redirect_uri mismatch"**
The redirect URI in the developer portal doesn't match. Check that it is exactly `http://localhost:3000/api/linkedin/callback` (no trailing slash) under **Auth** → **Authorized redirect URLs**.

**"Connection needs reconsent" / token expired**
LinkedIn OAuth refresh tokens expire after 365 days of inactivity. Click **Reconnect** on the LinkedIn panel to re-run the OAuth flow.

**Organization posts not appearing**
Organization publishing requires the **Marketing Developer Platform** product and `w_organization_social` scope, which needs separate approval from LinkedIn. Until approved, only member (personal) posts work.
