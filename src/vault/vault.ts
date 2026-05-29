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
import { homedir, hostname, platform, userInfo } from "node:os";
import { dirname, join } from "node:path";

import { decrypt, deriveKey, encrypt, type Envelope } from "./crypto.js";
import {
  EMPTY_VAULT,
  type OAuthCredential,
  type ProviderCredential,
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
  return join(homedir(), ".openzigs-social", "auth.json");
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

  /** Redacted JSON of vault structure — never includes secret material. */
  toString(): string {
    const v = this.cache ?? EMPTY_VAULT;
    return JSON.stringify({
      path: this.filePath,
      providers: Object.keys(v.providers),
      oauth: Object.keys(v.oauth)
    });
  }
}
