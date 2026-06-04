"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { applyRecipe, fetchRecipes, type StarterRecipe } from "@/lib/onboarding";

/**
 * Starter recipe picker (epic #100, sub #107). Presents the creator /
 * small-biz / agency presets; applying one seeds the brand-voice rulebook with
 * sensible tone, banned words, and exemplars plus a suggested platform set and
 * posting cadence.
 */
export function RecipePicker({ onComplete }: { onComplete?: () => void } = {}) {
  const { toast } = useToast();
  const [recipes, setRecipes] = React.useState<StarterRecipe[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [applying, setApplying] = React.useState<string | null>(null);
  const [appliedId, setAppliedId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setRecipes(await fetchRecipes());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchRecipes(controller.signal)
      .then((next) => {
        setRecipes(next);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const handleApply = async (recipe: StarterRecipe): Promise<void> => {
    setApplying(recipe.id);
    try {
      const result = await applyRecipe(recipe.id);
      if (result.applied) {
        setAppliedId(recipe.id);
        toast({ title: `${recipe.label} recipe applied` });
        onComplete?.();
      } else {
        toast({ title: "Could not apply recipe", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not apply recipe", variant: "destructive" });
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading starter recipes…</p>;
  }
  if (error || !recipes) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Couldn&apos;t load recipes.</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {recipes.map((recipe) => (
        <Card key={recipe.id} data-testid={`recipe-${recipe.id}`}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {recipe.label}
              {appliedId === recipe.id ? (
                <span className="text-xs font-normal text-emerald-600">Applied</span>
              ) : null}
            </CardTitle>
            <CardDescription>{recipe.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{recipe.tone}</p>
            <p className="text-xs text-muted-foreground">
              {recipe.cadencePerWeek} posts/week · {recipe.suggestedPlatforms.join(", ")}
            </p>
            <Button
              size="sm"
              variant={appliedId === recipe.id ? "outline" : "default"}
              disabled={applying === recipe.id}
              onClick={() => void handleApply(recipe)}
            >
              {appliedId === recipe.id ? "Re-apply" : "Use this recipe"}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
