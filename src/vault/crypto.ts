/**
 * AES-256-GCM envelope encryption for vault contents.
 *
 * Key is derived from a machine-stable identifier (or an injected secret in
 * tests) via scrypt. Never logged. Never written to disk in plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = Buffer.from("openzigs-social.vault.v1");

export interface Envelope {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

export function deriveKey(secret: string): Buffer {
  if (!secret || secret.length === 0) {
    throw new Error("vault: empty key material");
  }
  return scryptSync(secret, SALT, KEY_LEN);
}

export function encrypt(plaintext: string, key: Buffer): Envelope {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64")
  };
}

export function decrypt(env: Envelope, key: Buffer): string {
  if (env.v !== 1) {
    throw new Error(`vault: unsupported envelope version ${env.v}`);
  }
  const iv = Buffer.from(env.iv, "base64");
  const tag = Buffer.from(env.tag, "base64");
  const ct = Buffer.from(env.ct, "base64");
  if (iv.length !== IV_LEN) throw new Error("vault: bad iv length");
  if (tag.length !== TAG_LEN) throw new Error("vault: bad tag length");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
