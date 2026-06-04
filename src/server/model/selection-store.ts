/**
 * Model-selection store (epic #100, sub #102).
 *
 * Persists the operator's active LLM selection (local Ollama variant or a BYOK
 * provider) so the model panel's override survives restarts and the copilot
 * wrapper can re-bind to it without a process restart. The selection is NOT a
 * secret — provider API keys live in the encrypted vault — so this is a small
 * JSON document under the data dir, written atomically (tmp + rename).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveDataDir } from "../../config/paths.js";

/** Providers a selection may bind to. `local` means the on-host Ollama runtime. */
export const MODEL_PROVIDERS = ["local", "openai", "anthropic", "openai-compatible"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export interface ModelSelection {
  provider: ModelProvider;
  /** Selected model tag/name. Required for `local`; optional for BYOK. */
  model?: string;
}

/** `<dataDir>/model.json` — where the active selection is persisted. */
export function defaultSelectionPath(): string {
  return join(resolveDataDir(), "model.json");
}

export interface ModelSelectionStoreOptions {
  /** Override the file path (used in tests). */
  filePath?: string;
}

function isModelProvider(value: unknown): value is ModelProvider {
  return typeof value === "string" && (MODEL_PROVIDERS as readonly string[]).includes(value);
}

export class ModelSelectionStore {
  private readonly filePath: string;

  constructor(opts: ModelSelectionStoreOptions = {}) {
    this.filePath = opts.filePath ?? defaultSelectionPath();
  }

  get path(): string {
    return this.filePath;
  }

  /** Read the persisted selection, or `undefined` when none/corrupt. */
  async get(): Promise<ModelSelection | undefined> {
    if (!existsSync(this.filePath)) return undefined;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ModelSelection>;
      if (!isModelProvider(parsed.provider)) return undefined;
      return {
        provider: parsed.provider,
        ...(typeof parsed.model === "string" && parsed.model.length > 0
          ? { model: parsed.model }
          : {})
      };
    } catch {
      return undefined;
    }
  }

  /** Persist a selection atomically and return the normalized record. */
  async set(selection: ModelSelection): Promise<ModelSelection> {
    if (!isModelProvider(selection.provider)) {
      throw new Error(`invalid model provider: ${String(selection.provider)}`);
    }
    const normalized: ModelSelection = {
      provider: selection.provider,
      ...(typeof selection.model === "string" && selection.model.trim().length > 0
        ? { model: selection.model.trim() }
        : {})
    };
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(normalized), "utf8");
    await rename(tmp, this.filePath);
    return normalized;
  }
}
