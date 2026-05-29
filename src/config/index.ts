/**
 * Layered configuration loader.
 *
 * Precedence (lowest -> highest):
 *   1. `config/default.json`           (shipped defaults)
 *   2. `<dataDir>/user.json`           (user overrides)
 *   3. `OPENZIGS_SOCIAL_*` env vars    (operator/runtime overrides)
 *
 * The merged object is validated by {@link ConfigSchema}. Invalid config
 * throws a readable error (fail fast). `getConfig()` memoises the result.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { userConfigPath } from "./paths.js";
import { type Config, ConfigSchema } from "./schema.js";

/** Maps an env var name to a dotted path into the config object. */
const ENV_MAP: Record<string, string> = {
  OPENZIGS_SOCIAL_SERVER_HOST: "server.host",
  OPENZIGS_SOCIAL_SERVER_PORT: "server.port",
  OPENZIGS_SOCIAL_UI_ORIGIN: "server.uiOrigin",
  OPENZIGS_SOCIAL_LOG_LEVEL: "logging.level",
  OPENZIGS_SOCIAL_LOG_TO_FILE: "logging.toFile",
  OPENZIGS_SOCIAL_PRIVACY_MODE: "privacy.mode",
  OPENZIGS_SOCIAL_TELEGRAM_ENABLED: "telegram.enabled",
  OPENZIGS_SOCIAL_TELEGRAM_MODE: "telegram.mode",
  OPENZIGS_SOCIAL_PLATFORM_WEBHOOKS_ENABLED: "platform.webhooks.enabled",
  OPENZIGS_SOCIAL_PLATFORM_OAUTH_ENABLED: "platform.oauth.enabled"
};

type Json = Record<string, unknown>;

function defaultConfigPath(): string {
  // src/config/index.ts -> repo root/config/default.json
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "config", "default.json");
}

function readJsonIfPresent(path: string): Json {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    const trimmed = raw.trim();
    if (trimmed.length === 0) return {};
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`config: ${path} must contain a JSON object`);
    }
    return parsed as Json;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`config: failed to parse ${path}: ${err.message}`);
    }
    throw err;
  }
}

function isObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Deep-merge `source` onto `target`, returning a new object. */
function deepMerge(target: Json, source: Json): Json {
  const out: Json = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    if (isObject(existing) && isObject(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Set a dotted path on a plain object, creating intermediate objects. */
function setPath(obj: Json, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    const next = cursor[part];
    if (!isObject(next)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Json;
  }
  cursor[parts[parts.length - 1] as string] = value;
}

/** Build the env-override layer from `OPENZIGS_SOCIAL_*` vars. */
function envLayer(env: NodeJS.ProcessEnv): Json {
  const layer: Json = {};
  for (const [envName, path] of Object.entries(ENV_MAP)) {
    const raw = env[envName];
    if (raw === undefined) continue;
    setPath(layer, path, raw);
  }
  return layer;
}

export interface LoadConfigOptions {
  /** Override the default.json location (tests). */
  defaultPath?: string;
  /** Override the user.json location (tests). */
  userPath?: string;
  /** Override the env source (tests). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Load + validate config from all layers. Always reads fresh from disk/env;
 * use {@link getConfig} for the memoised singleton.
 */
export function loadConfig(opts: LoadConfigOptions = {}): Config {
  const defaults = readJsonIfPresent(opts.defaultPath ?? defaultConfigPath());
  const user = readJsonIfPresent(opts.userPath ?? userConfigPath());
  const env = envLayer(opts.env ?? process.env);

  const merged = deepMerge(deepMerge(defaults, user), env);

  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`config: invalid configuration:\n${issues}`);
  }
  return result.data;
}

let cached: Config | null = null;

/** Memoised, validated config. */
export function getConfig(): Config {
  if (cached === null) {
    cached = loadConfig();
  }
  return cached;
}

/** Clear the memoised config (tests). */
export function resetConfig(): void {
  cached = null;
}
