/**
 * Credential vault.
 *
 * - File: `~/.openzigs-social/auth.json`, mode 0o600
 * - Parent dir: 0o700
 * - AES-256-GCM envelope encryption (see ./crypto.ts)
 * - Never logs secrets; redacts on toString
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { hostname, platform, userInfo } from "node:os";
import { dirname } from "node:path";

import { vaultPath } from "../config/paths.js";
import { decrypt, deriveKey, encrypt, type Envelope } from "./crypto.js";
import {
  EMPTY_VAULT,
  type LinkedInAppCredential,
  type MetaAppCredential,
  type OAuthCredential,
  type PinterestAppCredential,
  type ProviderCredential,
  type TelegramCredential,
  type TikTokAppCredential,
  type TwitterAppCredential,
  type Vault,
  VaultSchema
} from "./types.js";

export const VAULT_DIR_MODE = 0o700;
export const VAULT_FILE_MODE = 0o600;

export interface VaultOptions {
  /** Override the vault file path (used in tests). */
  filePath?: string;
  /**
   * Override the secret used to derive the encryption key. If absent we use a
   * machine-stable identifier (hostname + username + platform). The default is
   * intentionally weak — production deployments should inject a passphrase.
   */
  keyMaterial?: string;
}

export function defaultVaultPath(): string {
  return vaultPath();
}

function defaultKeyMaterial(): string {
  return `${platform()}::${hostname()}::${userInfo().username}`;
}

export class CredentialVault {
  private readonly filePath: string;
  private readonly key: Buffer;
  private cache: Vault | null = null;

  constructor(opts: VaultOptions = {}) {
    this.filePath = opts.filePath ?? defaultVaultPath();
    this.key = deriveKey(opts.keyMaterial ?? defaultKeyMaterial());
  }

  /** Where the vault lives on disk. */
  get path(): string {
    return this.filePath;
  }

  async load(): Promise<Vault> {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) {
      this.cache = structuredClone(EMPTY_VAULT);
      return this.cache;
    }
    if (process.platform !== "win32") {
      const st = await stat(this.filePath);
      const mode = st.mode & 0o777;
      if (mode !== VAULT_FILE_MODE) {
        throw new Error(
          `vault: refusing to load ${this.filePath}: insecure file mode 0o${mode.toString(8).padStart(3, "0")} (expected 0o${VAULT_FILE_MODE.toString(8).padStart(3, "0")})`
        );
      }
    }
    const raw = await readFile(this.filePath, "utf8");
    const env = JSON.parse(raw) as Envelope;
    const plaintext = decrypt(env, this.key);
    const parsed = VaultSchema.parse(JSON.parse(plaintext));
    this.cache = parsed;
    return parsed;
  }

  /** Atomic write: tmpfile + chmod 0o600 + rename. */
  private async persist(vault: Vault): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { mode: VAULT_DIR_MODE, recursive: true });
    await chmod(dir, VAULT_DIR_MODE).catch(() => undefined);
    const env = encrypt(JSON.stringify(vault), this.key);
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(env), { mode: VAULT_FILE_MODE });
    await chmod(tmp, VAULT_FILE_MODE);
    await rename(tmp, this.filePath);
    this.cache = vault;
  }

  async setProvider(name: string, cred: ProviderCredential): Promise<void> {
    const vault = await this.load();
    const next: Vault = {
      ...vault,
      providers: { ...vault.providers, [name]: cred }
    };
    await this.persist(next);
  }

  async getProvider(name: string): Promise<ProviderCredential | undefined> {
    const vault = await this.load();
    return vault.providers[name];
  }

  async deleteProvider(name: string): Promise<void> {
    const vault = await this.load();
    if (!(name in vault.providers)) return;
    const providers = { ...vault.providers };
    delete providers[name];
    await this.persist({ ...vault, providers });
  }

  async setOAuth(platform: string, cred: OAuthCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({
      ...vault,
      oauth: { ...vault.oauth, [platform]: cred }
    });
  }

  async getOAuth(platform: string): Promise<OAuthCredential | undefined> {
    const vault = await this.load();
    return vault.oauth[platform];
  }

  async listOAuth(): Promise<Record<string, OAuthCredential>> {
    const vault = await this.load();
    return { ...vault.oauth };
  }

  /** Replace an OAuth credential atomically (used by the refresh scheduler). */
  async updateOAuth(
    platform: string,
    patch: Partial<OAuthCredential>
  ): Promise<OAuthCredential | undefined> {
    const vault = await this.load();
    const current = vault.oauth[platform];
    if (!current) return undefined;
    const next: OAuthCredential = { ...current, ...patch };
    await this.persist({
      ...vault,
      oauth: { ...vault.oauth, [platform]: next }
    });
    return next;
  }

  /** Persist Telegram bot credentials (setup wizard, sub #104). */
  async setTelegram(cred: TelegramCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({ ...vault, telegram: cred });
  }

  async getTelegram(): Promise<TelegramCredential | undefined> {
    const vault = await this.load();
    return vault.telegram;
  }

  /** Persist Meta app credentials for Cohort A connectors (epic #53). */
  async setMeta(cred: MetaAppCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({ ...vault, meta: cred });
  }

  async getMeta(): Promise<MetaAppCredential | undefined> {
    const vault = await this.load();
    return vault.meta;
  }

  /** Persist LinkedIn app credentials for the Cohort B connector (epic #60). */
  async setLinkedIn(cred: LinkedInAppCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({ ...vault, linkedin: cred });
  }

  async getLinkedIn(): Promise<LinkedInAppCredential | undefined> {
    const vault = await this.load();
    return vault.linkedin;
  }

  /** Persist Pinterest app credentials for the Cohort B connector (epic #60). */
  async setPinterest(cred: PinterestAppCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({ ...vault, pinterest: cred });
  }

  async getPinterest(): Promise<PinterestAppCredential | undefined> {
    const vault = await this.load();
    return vault.pinterest;
  }

  /** Persist TikTok app credentials for the Cohort B connector (epic #60). */
  async setTikTok(cred: TikTokAppCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({ ...vault, tiktok: cred });
  }

  async getTikTok(): Promise<TikTokAppCredential | undefined> {
    const vault = await this.load();
    return vault.tiktok;
  }

  /** Persist X (Twitter) app credentials for the Cohort C connector (epic #66). */
  async setTwitter(cred: TwitterAppCredential): Promise<void> {
    const vault = await this.load();
    await this.persist({ ...vault, twitter: cred });
  }

  async getTwitter(): Promise<TwitterAppCredential | undefined> {
    const vault = await this.load();
    return vault.twitter;
  }

  /** Redacted JSON of vault structure — never includes secret material. */
  toString(): string {
    const v = this.cache ?? EMPTY_VAULT;
    return JSON.stringify({
      path: this.filePath,
      providers: Object.keys(v.providers),
      oauth: Object.keys(v.oauth),
      telegram: v.telegram ? true : false,
      meta: v.meta ? true : false,
      linkedin: v.linkedin ? true : false,
      pinterest: v.pinterest ? true : false,
      tiktok: v.tiktok ? true : false,
      twitter: v.twitter ? true : false
    });
  }
}
