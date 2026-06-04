"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { fetchModelStatus, pullModel, selectModel, type ModelStatus } from "@/lib/onboarding";

/**
 * Model panel (epic #100, sub #102). Surfaces the local Ollama probe, the
 * auto-detected (RAM-sized) Gemma 4 recommendation, an override dropdown, a
 * pull control, BYOK provider chips, and the YouTube-quota / BYOK-credit widget
 * slots. Never renders secret material — only "configured" flags.
 */
export function ModelPanel({ onComplete }: { onComplete?: () => void } = {}) {
  const { toast } = useToast();
  const [status, setStatus] = React.useState<ModelStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [choice, setChoice] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [pullError, setPullError] = React.useState<{
    message: string;
    updateUrl?: string;
  } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const next = await fetchModelStatus();
      setStatus(next);
      setChoice(
        next.selection?.model ?? next.ollama.installedVariant ?? next.ollama.recommendedVariant
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchModelStatus(controller.signal)
      .then((next) => {
        setStatus(next);
        setChoice(
          next.selection?.model ?? next.ollama.installedVariant ?? next.ollama.recommendedVariant
        );
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Detecting local model runtime…</p>;
  }
  if (error || !status) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Couldn&apos;t reach the model service.</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const { ollama, providers, widgets } = status;

  const handleSelect = async (): Promise<void> => {
    setBusy(true);
    try {
      await selectModel({ provider: "local", model: choice });
      toast({ title: "Model selected", description: choice });
      onComplete?.();
      await load();
    } catch {
      toast({ title: "Could not select model", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async (): Promise<void> => {
    setBusy(true);
    setPullError(null);
    try {
      const result = await pullModel(choice);
      if (result.pulling) {
        toast({ title: "Pulling model", description: `${choice}: ${result.status}` });
        await load();
      } else if (result.code === "ollama_outdated") {
        // Ollama's version gate (HTTP 412 → 409). Surface an actionable message
        // with the update link instead of a generic "pull failed".
        setPullError({
          message:
            result.error ?? "Your local Ollama is out of date. Update it to pull this model.",
          updateUrl: result.updateUrl
        });
      } else {
        toast({ title: "Pull failed", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Pull failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const installed = ollama.models.includes(choice) || ollama.installedVariant === choice;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local model</CardTitle>
        <CardDescription>
          {ollama.reachable
            ? "Ollama is running. We recommend the variant that fits your machine."
            : "Ollama isn't running — install it or pick a BYOK provider below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            data-testid="ollama-state"
            className={ollama.reachable ? "text-emerald-600" : "text-amber-600"}
          >
            {ollama.reachable ? "Ollama detected" : "Ollama not detected"}
          </span>
          <span className="text-muted-foreground">·</span>
          <span data-testid="recommended-variant">Recommended: {ollama.recommendedVariant}</span>
        </div>

        <div className="space-y-1">
          <label htmlFor="model-variant" className="text-sm font-medium">
            Model variant
          </label>
          <select
            id="model-variant"
            aria-label="Model variant"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {ollama.variants.map((variant) => (
              <option key={variant} value={variant}>
                {variant}
                {variant === ollama.recommendedVariant ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void handleSelect()}>
            Use this model
          </Button>
          {ollama.reachable && !installed ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void handlePull()}>
              Pull {choice}
            </Button>
          ) : null}
        </div>

        {pullError ? (
          <div
            role="alert"
            data-testid="pull-error"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p>{pullError.message}</p>
            {pullError.updateUrl ? (
              <a
                href={pullError.updateUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-medium underline"
              >
                Download the latest Ollama
              </a>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-medium">Bring your own key</p>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <span
                key={provider.id}
                data-testid="byok-chip"
                className={`rounded-full border px-3 py-1 text-xs ${
                  provider.configured
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-border text-muted-foreground"
                }`}
              >
                {provider.label}
                {provider.configured ? " ✓" : ""}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div
            data-testid="widget-youtube"
            className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground"
          >
            YouTube quota
            <div>{widgets.youtubeQuota.available ? "Live" : "Coming soon"}</div>
          </div>
          <div
            data-testid="widget-credit"
            className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground"
          >
            BYOK credit usage
            <div>{widgets.byokCredit.available ? "Tracking" : "Add a key to track"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
