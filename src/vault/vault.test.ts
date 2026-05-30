import { mkdtempSync, statSync } from "node:fs";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialVault, defaultVaultPath } from "./vault.js";

function makeVault(): { vault: CredentialVault; dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "ozs-vault-"));
  const path = join(dir, "auth.json");
  const vault = new CredentialVault({ filePath: path, keyMaterial: "test-key" });
  return { vault, dir, path };
}

describe("CredentialVault", () => {
  let ctx: ReturnType<typeof makeVault>;
  beforeEach(() => {
    ctx = makeVault();
  });
  afterEach(() => {
    // tmpdir is auto-collected; nothing to do.
  });

  it("returns an empty vault when the file is missing", async () => {
    const v = await ctx.vault.load();
    expect(v.providers).toEqual({});
    expect(v.oauth).toEqual({});
  });

  it("persists a provider and reads it back", async () => {
    await ctx.vault.setProvider("openai", { apiKey: "sk-xxx", model: "gpt-4o" });
    const got = await ctx.vault.getProvider("openai");
    expect(got).toEqual({ apiKey: "sk-xxx", model: "gpt-4o" });
  });

  it("survives a process restart (new instance reads same file)", async () => {
    await ctx.vault.setProvider("anthropic", { apiKey: "ant-1" });
    const second = new CredentialVault({ filePath: ctx.path, keyMaterial: "test-key" });
    const got = await second.getProvider("anthropic");
    expect(got?.apiKey).toBe("ant-1");
  });

  it("writes the file with mode 0o600", async () => {
    await ctx.vault.setProvider("openai", { apiKey: "k" });
    const mode = statSync(ctx.path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("never writes plaintext secret material", async () => {
    await ctx.vault.setProvider("openai", { apiKey: "sk-DEADBEEF" });
    const raw = await readFile(ctx.path, "utf8");
    expect(raw).not.toContain("sk-DEADBEEF");
    expect(raw).not.toContain("apiKey");
  });

  it("supports oauth set/get/list/update", async () => {
    await ctx.vault.setOAuth("twitter", {
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: 1
    });
    expect((await ctx.vault.getOAuth("twitter"))?.accessToken).toBe("at");
    expect(Object.keys(await ctx.vault.listOAuth())).toEqual(["twitter"]);
    const updated = await ctx.vault.updateOAuth("twitter", { accessToken: "at2" });
    expect(updated?.accessToken).toBe("at2");
    expect(updated?.refreshToken).toBe("rt");
  });

  it("updateOAuth returns undefined when platform is unknown", async () => {
    expect(await ctx.vault.updateOAuth("nope", { accessToken: "x" })).toBeUndefined();
  });

  it("deletes a provider", async () => {
    await ctx.vault.setProvider("openai", { apiKey: "k" });
    await ctx.vault.deleteProvider("openai");
    expect(await ctx.vault.getProvider("openai")).toBeUndefined();
    // No-op for unknown name.
    await ctx.vault.deleteProvider("ghost");
  });

  it("toString is redacted (lists keys, not values)", async () => {
    await ctx.vault.setProvider("openai", { apiKey: "secret-secret-secret" });
    const s = ctx.vault.toString();
    expect(s).toContain("openai");
    expect(s).not.toContain("secret-secret-secret");
  });

  it("persists telegram credentials and reads them back", async () => {
    await ctx.vault.setTelegram({ botToken: "123:ABC-tok", adminChatId: "987654" });
    const got = await ctx.vault.getTelegram();
    expect(got).toEqual({ botToken: "123:ABC-tok", adminChatId: "987654" });
  });

  it("getTelegram returns undefined when unset", async () => {
    expect(await ctx.vault.getTelegram()).toBeUndefined();
  });

  it("never writes the telegram bot token in plaintext", async () => {
    await ctx.vault.setTelegram({ botToken: "123:SUPERSECRET", adminChatId: "5" });
    const raw = await readFile(ctx.path, "utf8");
    expect(raw).not.toContain("SUPERSECRET");
    expect(raw).not.toContain("botToken");
  });

  it("toString reports telegram presence without leaking the token", async () => {
    await ctx.vault.setTelegram({ botToken: "123:LEAKME", adminChatId: "5" });
    const s = ctx.vault.toString();
    expect(s).toContain('"telegram":true');
    expect(s).not.toContain("LEAKME");
  });

  it("persists X (Twitter) app credentials and reads them back", async () => {
    await ctx.vault.setTwitter({ clientId: "cid", clientSecret: "csecret" });
    const got = await ctx.vault.getTwitter();
    expect(got).toEqual({ clientId: "cid", clientSecret: "csecret" });
  });

  it("getTwitter returns undefined when unset", async () => {
    expect(await ctx.vault.getTwitter()).toBeUndefined();
  });

  it("never writes the Twitter client secret in plaintext and reports presence", async () => {
    await ctx.vault.setTwitter({ clientId: "cid", clientSecret: "TW-SUPERSECRET" });
    const raw = await readFile(ctx.path, "utf8");
    expect(raw).not.toContain("TW-SUPERSECRET");
    expect(raw).not.toContain("clientSecret");
    expect(ctx.vault.toString()).toContain('"twitter":true');
  });

  it("default path lives under the user home dir", () => {
    expect(defaultVaultPath()).toMatch(/\.openzigs-social\/auth\.json$/);
  });

  it("exposes the configured file path", () => {
    expect(ctx.vault.path).toBe(ctx.path);
  });

  it("refuses to load() when the file mode is weaker than 0o600", async () => {
    // Write a valid-looking vault file but with insecure perms.
    await ctx.vault.setProvider("openai", { apiKey: "k" });
    await chmod(ctx.path, 0o644);
    const fresh = new CredentialVault({ filePath: ctx.path, keyMaterial: "test-key" });
    await expect(fresh.load()).rejects.toThrow(/0o644/);
    await expect(fresh.load()).rejects.toThrow(/0o600/);
  });

  it("load() error mentions the actual and expected modes", async () => {
    await writeFile(ctx.path, "{}", { mode: 0o600 });
    await chmod(ctx.path, 0o666);
    const fresh = new CredentialVault({ filePath: ctx.path, keyMaterial: "test-key" });
    await expect(fresh.load()).rejects.toThrow(/insecure file mode 0o666.*expected 0o600/);
  });
});
