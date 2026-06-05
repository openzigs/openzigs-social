/**
 * Model panel API router (epic #100, sub #102).
 *
 * Routes (under `/api/model`):
 *   - GET  /status   — probe Ollama, surface the auto-detected Gemma 4 variant,
 *                      installed models, BYOK provider chips, and the active
 *                      selection. When Ollama is unreachable, BYOK config is the
 *                      surfaced default.
 *   - POST /select   — persist a per-workspace model override. The selection is
 *                      stored so the wrapper re-binds without a restart.
 *   - POST /pull     — ask the local Ollama runtime to pull a Gemma 4 variant.
 *                      Proxies Ollama's `/api/pull` HTTP endpoint; the agent
 *                      NEVER shells out to download models (CI-safe — fetch is
 *                      injectable and mocked in tests).
 *
 * Secret handling (OWASP): BYOK keys are read from / written to the encrypted
 * vault elsewhere; this router only reports whether a provider is *configured*
 * and never echoes key material. The pull `model` is validated against a strict
 * allowlist pattern to prevent request smuggling / injection into the Ollama
 * call (A03).
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import type { CredentialVault } from "../../vault/index.js";
import {
  OLLAMA_DEFAULT_BASE_URL,
  pickGemma4Variant,
  probeOllama,
  type OllamaProbeResult
} from "../../copilot/providers/ollama.js";
import {
  MODEL_PROVIDERS,
  ModelSelectionStore,
  type ModelProvider,
  type ModelSelection
} from "./selection-store.js";

type FetchLike = typeof fetch;

/** BYOK providers surfaced as chips, in display order. */
export const BYOK_PROVIDERS = ["openai", "anthropic", "openai-compatible"] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

const BYOK_LABELS: Record<ByokProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "openai-compatible": "OpenAI-compatible"
};

/** Gemma 4 variants, best → floor (mirrors the acceptance-criteria table). */
export const GEMMA4_VARIANTS = ["gemma4:12b", "gemma4:e4b", "gemma4:e2b"] as const;

/** Allowlist for a pullable model tag — letters/digits and `:._-` only. */
const MODEL_TAG_RE = /^[a-z0-9][a-z0-9:._-]{0,63}$/;

export interface ModelRouterDeps {
  vault: CredentialVault;
  selection: ModelSelectionStore;
  /** Injectable fetch (defaults to global) for the Ollama probe + pull. */
  fetchImpl?: FetchLike;
  /** Ollama base URL (the `/v1` host); defaults to the local runtime. */
  ollamaBaseUrl?: string;
  /** Injectable probe for tests. */
  probe?: typeof probeOllama;
  /** Injectable RAM-based recommendation for tests. */
  recommendVariant?: () => string;
}

const SelectBody = z
  .object({
    provider: z.enum(MODEL_PROVIDERS as unknown as [ModelProvider, ...ModelProvider[]]),
    model: z.string().trim().min(1).max(64).optional()
  })
  .strict();

const PullBody = z
  .object({
    model: z.string().trim().min(1).max(64)
  })
  .strict();

/** Distinct, ordered list of installed model names from a probe result. */
function installedModels(probe: OllamaProbeResult): string[] {
  const names = (probe.tags?.models ?? [])
    .map((m) => m.name ?? m.model ?? "")
    .filter((n) => n.length > 0);
  return [...new Set(names)];
}

/** Build the model panel router. */
export function createModelRouter(deps: ModelRouterDeps): Router {
  const router = Router();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const ollamaBaseUrl = deps.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL;
  const probeFn = deps.probe ?? probeOllama;
  const recommend = deps.recommendVariant ?? (() => pickGemma4Variant());

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/status", limiter, (_req: Request, res: Response): void => {
    void (async () => {
      const probe = await probeFn(ollamaBaseUrl, fetchImpl);
      const vault = await deps.vault.load();
      const providers = BYOK_PROVIDERS.map((id) => ({
        id,
        label: BYOK_LABELS[id],
        configured: Boolean(vault.providers[id]?.apiKey)
      }));
      const selection = await deps.selection.get();

      // When Ollama is unreachable the panel defaults to BYOK; otherwise local.
      const source: "local" | "byok" =
        selection?.provider && selection.provider !== "local"
          ? "byok"
          : probe.reachable
            ? "local"
            : "byok";

      res.status(200).json({
        timestamp: new Date().toISOString(),
        ollama: {
          reachable: probe.reachable,
          baseUrl: ollamaBaseUrl,
          installedVariant: probe.installedVariant ?? null,
          recommendedVariant: recommend(),
          variants: GEMMA4_VARIANTS,
          models: installedModels(probe)
        },
        providers,
        selection: selection ?? null,
        source,
        // Inline widgets surfaced by the panel (YouTube quota #58, BYOK credit
        // usage #69). Their data sources are owned by separate epics; the panel
        // renders the slots and these flags advertise availability.
        widgets: {
          youtubeQuota: { available: true },
          byokCredit: { available: providers.some((p) => p.configured) }
        }
      });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  router.post("/select", limiter, (req: Request, res: Response): void => {
    void (async () => {
      const parsed = SelectBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
        return;
      }
      const { provider, model } = parsed.data;

      // A local selection must name a model so the wrapper can bind a variant.
      if (provider === "local" && !model) {
        res.status(400).json({ error: "model is required for the local provider" });
        return;
      }
      // A BYOK selection must reference a configured provider (key in vault).
      if (provider !== "local") {
        const cred = await deps.vault.getProvider(provider);
        if (!cred?.apiKey) {
          res.status(409).json({ error: `provider ${provider} is not configured` });
          return;
        }
      }

      const saved: ModelSelection = await deps.selection.set({
        provider,
        ...(model ? { model } : {})
      });
      res.status(200).json({ selected: true, selection: saved });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  router.post("/pull", limiter, (req: Request, res: Response): void => {
    void (async () => {
      const parsed = PullBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
        return;
      }
      const model = parsed.data.model;
      if (!MODEL_TAG_RE.test(model)) {
        res.status(400).json({ error: "invalid model tag" });
        return;
      }

      // Proxy the pull to the local Ollama runtime. We never shell out; Ollama's
      // HTTP API owns the download. `stream:false` yields a single JSON status.
      const host = ollamaBaseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
      let upstream: Awaited<ReturnType<FetchLike>>;
      try {
        upstream = await fetchImpl(`${host}/api/pull`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: model, stream: false })
        });
      } catch {
        res.status(502).json({ error: "ollama unreachable" });
        return;
      }
      // A 412 is Ollama's version gate: the local runtime is too old to pull a
      // newly released model (e.g. gemma4:12b needs Ollama >= 0.30.5). Surface a
      // distinct, machine-readable shape so the UI can render an update prompt
      // instead of a generic failure. We do not echo upstream's raw body — a
      // fixed message avoids leaking anything and is safe to render.
      if (upstream.status === 412) {
        res.status(409).json({
          error:
            "Your local Ollama is out of date. Update it to v0.30.5 or newer to pull this model.",
          code: "ollama_outdated",
          minVersion: "0.30.5",
          updateUrl: "https://ollama.com/download"
        });
        return;
      }
      if (!upstream.ok) {
        res.status(502).json({ error: "ollama pull failed" });
        return;
      }
      const body = (await upstream.json().catch(() => ({}))) as { status?: string };
      res.status(200).json({ pulling: true, model, status: body.status ?? "success" });
    })().catch(() => {
      res.status(500).json({ error: "internal error" });
    });
  });

  return router;
}
