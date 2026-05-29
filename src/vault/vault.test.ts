import { mkdtempSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

  it("default path lives under the user home dir", () => {
    expect(defaultVaultPath()).toMatch(/\.openzigs-social\/auth\.json$/);
  });

  it("exposes the configured file path", () => {
    expect(ctx.vault.path).toBe(ctx.path);
  });
});
