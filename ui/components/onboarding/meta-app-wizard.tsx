"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { saveMetaApp, type SaveMetaAppResult } from "@/lib/onboarding";

/** Numbered Meta developer-console steps with screenshot placeholders. */
const META_STEPS: { title: string; body: string }[] = [
  { title: "Create an app", body: "In developers.facebook.com → My Apps → Create App → Business." },
  { title: "Add products", body: "Add Instagram, Facebook Login, and Threads to the app." },
  {
    title: "Copy credentials",
    body: "App Dashboard → Settings → Basic → copy App ID + App Secret."
  },
  {
    title: "Register redirect URIs",
    body: "Paste the redirect URIs below into Valid OAuth Redirect URIs."
  }
];

/** Copy text to the clipboard, tolerating unavailable clipboard APIs. */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Per-user Meta app wizard (epic #100, sub #106). A guided, screenshot-backed
 * walkthrough that stores the App ID + Secret in the vault and hands back the
 * copy-pasteable scopes + redirect URIs the operator registers in the Meta
 * developer console. The App Secret is write-only — it never returns to the UI.
 */
export function MetaAppWizard({ onComplete }: { onComplete?: () => void } = {}) {
  const { toast } = useToast();
  const [appId, setAppId] = React.useState("");
  const [appSecret, setAppSecret] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<SaveMetaAppResult | null>(null);

  const canSubmit = appId.trim().length > 0 && appSecret.trim().length > 0 && !busy;

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const saved = await saveMetaApp(appId.trim(), appSecret.trim());
      if (saved.stored) {
        setResult(saved);
        setAppSecret("");
        toast({ title: "Meta app saved" });
        onComplete?.();
      } else {
        toast({ title: "Could not save Meta app", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not save Meta app", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleCopyScopes = async (): Promise<void> => {
    const scopes = (result?.scopes ?? []).join(",");
    const ok = await copyText(scopes);
    toast({ title: ok ? "Scopes copied" : "Copy failed", variant: ok ? undefined : "destructive" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta app setup</CardTitle>
        <CardDescription>
          Create your own Meta app so Instagram, Facebook, and Threads use your rate limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="space-y-3">
          {META_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              <div className="space-y-2">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.body}</p>
                <div
                  data-testid="screenshot-placeholder"
                  role="img"
                  aria-label={`Screenshot: ${step.title}`}
                  className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
                >
                  Screenshot
                </div>
              </div>
            </li>
          ))}
        </ol>

        <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-1">
            <Label htmlFor="meta-app-id">App ID</Label>
            <Input
              id="meta-app-id"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="123456789012345"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="meta-app-secret">App Secret</Label>
            <Input
              id="meta-app-secret"
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="••••••••••••••••"
            />
          </div>
          <Button type="submit" size="sm" disabled={!canSubmit}>
            Save Meta app
          </Button>
        </form>

        {result ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Scopes to enable</p>
              <Button variant="outline" size="sm" onClick={() => void handleCopyScopes()}>
                Copy
              </Button>
            </div>
            <code
              data-testid="meta-scopes"
              className="block break-words rounded bg-muted px-2 py-1 text-xs"
            >
              {result.scopes.join(",")}
            </code>
            <p className="text-sm font-medium">Redirect URIs</p>
            <ul className="space-y-1">
              {result.redirectUris.map((r) => (
                <li key={r.platform}>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                    {r.redirectUri}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
