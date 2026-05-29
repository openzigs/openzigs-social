/**
 * Ollama provider — OpenAI-compatible endpoint at `/v1/chat/completions`.
 *
 * Default model is Gemma 4. Variant is picked by host RAM (see
 * `pickGemma4Variant`) and may be overridden by config.
 */
import { totalmem } from "node:os";

import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { Provider, ProviderConfig } from "./types.js";

export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

export interface OllamaTag {
  name: string;
  model?: string;
}

export interface OllamaTagsResponse {
  models?: OllamaTag[];
}

/**
 * Choose a Gemma 4 variant by total host RAM.
 *
 *  - < 8 GiB              → `gemma4:e2b`
 *  - 8 GiB ≤ x < 16 GiB   → `gemma4:e4b`
 *  - 16 GiB ≤ x < 32 GiB  → `gemma4:e8b`  (per ollama tag catalog)
 *  - ≥ 32 GiB             → `gemma4:e8b`  (largest commonly-pullable variant)
 *
 * Issue #31 also calls out a 26b / 31b roadmap; those are gated behind a
 * future ENABLE_GEMMA4_BIG flag.
 */
export function pickGemma4Variant(totalMemBytes: number = totalmem()): string {
  const gib = totalMemBytes / (1024 * 1024 * 1024);
  if (gib < 8) return "gemma4:e2b";
  if (gib < 16) return "gemma4:e4b";
  return "gemma4:e8b";
}

/**
 * From an Ollama `/api/tags` response, choose the largest installed Gemma 4
 * variant in this preference order:
 *   `gemma4:e8b` > `gemma4:e4b` > `gemma4:e2b`
 * (per acceptance criteria on issue #31).
 */
export function pickInstalledGemma4(tags: OllamaTagsResponse | undefined): string | undefined {
  const names = new Set(
    (tags?.models ?? []).map((t) => t.name ?? t.model ?? "").filter((n) => n.length > 0)
  );
  for (const candidate of ["gemma4:e8b", "gemma4:e4b", "gemma4:e2b"]) {
    if (names.has(candidate)) return candidate;
  }
  return undefined;
}

export interface OllamaProbeResult {
  reachable: boolean;
  installedVariant?: string;
  /** Raw tags as returned by Ollama. */
  tags?: OllamaTagsResponse;
}

/** GET <baseUrl>/api/tags (note: that's the bare host, not the /v1 prefix). */
export async function probeOllama(
  baseUrl: string = OLLAMA_DEFAULT_BASE_URL,
  fetchImpl: typeof fetch = fetch
): Promise<OllamaProbeResult> {
  const host = baseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  try {
    const res = await fetchImpl(`${host}/api/tags`);
    if (!res.ok) return { reachable: false };
    const tags = (await res.json()) as OllamaTagsResponse;
    return { reachable: true, installedVariant: pickInstalledGemma4(tags), tags };
  } catch {
    return { reachable: false };
  }
}

export function createOllamaProvider(
  opts: { baseUrl?: string; model?: string; name?: string } = {}
): Provider {
  const cfg: ProviderConfig = {
    kind: "openai-compatible",
    name: opts.name ?? "ollama",
    baseUrl: opts.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
    model: opts.model ?? pickGemma4Variant(),
    apiKey: "ollama", // Ollama ignores the token but the SDK requires a string.
    isLocal: true
  };
  return new OpenAICompatibleProvider(cfg);
}
