# OAuth Walkthroughs

Step-by-step setup guides for connecting each social platform to openzigs-social. Every guide follows the same structure as [docs/TELEGRAM_SETUP.md](../TELEGRAM_SETUP.md): prerequisites, numbered steps, exact scopes, redirect URI registration, and common errors.

| Platform | File | Notes |
|---|---|---|
| Twitter / X | [twitter-x.md](twitter-x.md) | BYOK developer account; OAuth 2.0 PKCE; monthly write quota |
| Instagram | [instagram.md](instagram.md) | Requires Meta developer app + Instagram Business/Creator account |
| Facebook Pages | [facebook.md](facebook.md) | Shares the same Meta app as Instagram |
| Threads | [threads.md](threads.md) | Same Meta app; separate permission set |
| LinkedIn | [linkedin.md](linkedin.md) | No DMs in v1 (Compliance Partner Program required) |
| YouTube | [youtube.md](youtube.md) | Google Cloud Console; 10,000 unit/day quota |
| Pinterest | [pinterest.md](pinterest.md) | Pinterest developer portal; Ad Account permissions |
| TikTok | [tiktok.md](tiktok.md) | Sandbox mode first; production approval required for public posts |

## General notes

- All credentials are stored encrypted in `~/.openzigs-social/auth.json` (AES-256-GCM, file mode `0600`). They are never logged or echoed after initial entry.
- The redirect URI for every platform follows the pattern: `http://localhost:3000/api/<platform>/callback`
- Use the **Onboarding** tab (`/onboarding`) in the UI to walk through each connection with guided in-app prompts. The walkthroughs below describe what happens at the developer portal side.
- If a token expires or is revoked the connector reports `needsReconsent`. Open the affected platform panel and repeat the OAuth flow — the vault entry is updated atomically on success.
