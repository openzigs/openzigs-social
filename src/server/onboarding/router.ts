/**
 * Onboarding API router (epic #100, sub #107 + epic AC).
 *
 * Routes (under `/api/onboarding`):
 *   - GET  /recipes           — list the starter recipe presets.
 *   - POST /recipes/apply     — seed the brand-voice rulebook + return the
 *                               preset's suggested platforms / cadence.
 *   - POST /brand-voice/import — parse a pasted/uploaded JSON or CSV document
 *                               into exemplars and merge them into the rulebook
 *                               (builds the exemplar vocabulary the profiler
 *                               scores against).
 *
 * Security (OWASP): payload size is bounded by the global 1mb JSON limit and a
 * per-field cap; malformed imports return 422 (never a 500). The rulebook repo
 * uses parameterized statements (A03). No secrets touch this router.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import type { BrandVoiceRepository } from "../../personality/rulebook-repository.js";
import {
  RECIPE_IDS,
  STARTER_RECIPES,
  isRecipeId,
  listRecipes,
  mergeBrandVoice,
  parseBrandVoiceImport,
  type RecipeId
} from "./recipes.js";

export interface OnboardingRouterDeps {
  brandVoice: BrandVoiceRepository;
}

const ApplyBody = z
  .object({
    recipe: z.enum(RECIPE_IDS as unknown as [RecipeId, ...RecipeId[]])
  })
  .strict();

const ImportBody = z
  .object({
    format: z.enum(["json", "csv"]),
    content: z.string().min(1).max(200_000)
  })
  .strict();

/** Build the onboarding router bound to the brand-voice repository. */
export function createOnboardingRouter(deps: OnboardingRouterDeps): Router {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/recipes", limiter, (_req: Request, res: Response): void => {
    res.status(200).json({ timestamp: new Date().toISOString(), recipes: listRecipes() });
  });

  router.post("/recipes/apply", limiter, (req: Request, res: Response): void => {
    const parsed = ApplyBody.safeParse(req.body);
    if (!parsed.success || !isRecipeId(parsed.data.recipe)) {
      res.status(400).json({ error: parsed.success ? "unknown recipe" : "invalid request" });
      return;
    }
    const recipe = STARTER_RECIPES[parsed.data.recipe];
    const current = deps.brandVoice.get();
    const { rulebook } = mergeBrandVoice(current, {
      tone: recipe.tone,
      bannedWords: recipe.bannedWords,
      exemplars: recipe.exemplars
    });
    const saved = deps.brandVoice.save(rulebook);
    res.status(200).json({
      applied: true,
      recipe: recipe.id,
      rulebook: saved,
      suggestedPlatforms: recipe.suggestedPlatforms,
      cadencePerWeek: recipe.cadencePerWeek
    });
  });

  router.post("/brand-voice/import", limiter, (req: Request, res: Response): void => {
    const parsed = ImportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid request" });
      return;
    }
    let incoming;
    try {
      incoming = parseBrandVoiceImport(parsed.data.content, parsed.data.format);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "invalid import" });
      return;
    }
    if (incoming.exemplars.length === 0 && incoming.bannedWords.length === 0 && !incoming.tone) {
      res.status(422).json({ error: "no brand-voice content found" });
      return;
    }
    const current = deps.brandVoice.get();
    const { rulebook, added } = mergeBrandVoice(current, incoming);
    const saved = deps.brandVoice.save(rulebook);
    res.status(200).json({ imported: true, added, rulebook: saved });
  });

  return router;
}
