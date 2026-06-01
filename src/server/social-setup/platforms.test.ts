import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CredentialVault } from "../../vault/index.js";
import {
  PLATFORM_SETUP,
  SOCIAL_PLATFORMS,
  buildAuthorizeUrl,
  isSocialPlatform,
  resolveClientId
} from "./platforms.js";

function makeVault(): CredentialVault {
  const dir = mkdtempSync(join(tmpdir(), "ozs-plat-"));
  return new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "test-key" });
}

describe("platform setup metadata", () => {
  it("covers every social platform with scopes and a credential", () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const meta = PLATFORM_SETUP[platform];
      expect(meta.platform).toBe(platform);
      expect(meta.scopes.length).toBeGreaterThan(0);
      expect(meta.authUrl).toMatch(/^https:\/\//);
    }
  });

  it("narrows known and rejects unknown platforms", () => {
    expect(isSocialPlatform("twitter")).toBe(true);
    expect(isSocialPlatform("myspace")).toBe(false);
  });

  describe("resolveClientId", () => {
    it("reads the Meta app id for meta-backed platforms", async () => {
      const vault = makeVault();
      await vault.setMeta({ appId: "meta-123", appSecret: "shh" });
      expect(await resolveClientId(vault, "meta")).toBe("meta-123");
    });

    it("reads platform-specific client ids", async () => {
      const vault = makeVault();
      await vault.setLinkedIn({ clientId: "li-1", clientSecret: "s" });
      await vault.setPinterest({ appId: "pin-1", appSecret: "s" });
      await vault.setTikTok({ clientKey: "tk-1", clientSecret: "s" });
      await vault.setTwitter({ clientId: "tw-1" });
      expect(await resolveClientId(vault, "linkedin")).toBe("li-1");
      expect(await resolveClientId(vault, "pinterest")).toBe("pin-1");
      expect(await resolveClientId(vault, "tiktok")).toBe("tk-1");
      expect(await resolveClientId(vault, "twitter")).toBe("tw-1");
    });

    it("returns undefined when unconfigured", async () => {
      const vault = makeVault();
      expect(await resolveClientId(vault, "meta")).toBeUndefined();
    });
  });

  describe("buildAuthorizeUrl", () => {
    it("builds a space-separated scope URL with state", () => {
      const url = new URL(
        buildAuthorizeUrl(PLATFORM_SETUP.facebook, {
          clientId: "abc",
          redirectUri: "http://localhost:3000/oauth/callback/facebook",
          state: "st8"
        })
      );
      expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
      expect(url.searchParams.get("client_id")).toBe("abc");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("state")).toBe("st8");
      expect(url.searchParams.get("scope")).toBe(
        "pages_manage_posts pages_read_engagement pages_show_list"
      );
    });

    it("uses client_key and comma-separated scopes for TikTok", () => {
      const url = new URL(
        buildAuthorizeUrl(PLATFORM_SETUP.tiktok, {
          clientId: "key1",
          redirectUri: "http://localhost:3000/oauth/callback/tiktok",
          state: "st"
        })
      );
      expect(url.searchParams.get("client_key")).toBe("key1");
      expect(url.searchParams.get("client_id")).toBeNull();
      expect(url.searchParams.get("scope")).toContain(",");
    });
  });
});
