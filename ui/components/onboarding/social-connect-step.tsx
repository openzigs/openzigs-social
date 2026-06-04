"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import {
  authorizePlatform,
  fetchSocialSetupStatus,
  type PlatformSetupStatus
} from "@/lib/onboarding";

/** Open a URL in a new tab (extracted for testability). */
function openExternal(url: string): void {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Per-platform OAuth connect step (epic #100, sub #105). Drives the
 * `social-setup-wizard` skill: lists each platform's app-configured /
 * connected state and mints an authorize URL on demand. The URL embeds only the
 * non-secret app id + scopes + a CSRF state.
 */
export function SocialConnectStep({ onComplete }: { onComplete?: () => void } = {}) {
  const { toast } = useToast();
  const [platforms, setPlatforms] = React.useState<PlatformSetupStatus[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const status = await fetchSocialSetupStatus();
      setPlatforms(status.platforms);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchSocialSetupStatus(controller.signal)
      .then((status) => {
        setPlatforms(status.platforms);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const handleConnect = async (platform: string): Promise<void> => {
    setPending(platform);
    try {
      const result = await authorizePlatform(platform);
      openExternal(result.url);
      toast({ title: "Authorize window opened", description: result.platform });
      onComplete?.();
    } catch {
      toast({ title: "Couldn't start authorization", variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading platforms…</p>;
  }
  if (error || !platforms) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Couldn&apos;t load platform setup.</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect platforms</CardTitle>
        <CardDescription>
          Authorize each platform you want to manage. Configure the app credentials first if a
          platform is marked “app not configured”.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="divide-y divide-border">
          {platforms.map((p) => {
            const state = p.connected
              ? "Connected"
              : p.needsReconsent
                ? "Reconnect needed"
                : p.appConfigured
                  ? "Ready to connect"
                  : "App not configured";
            return (
              <li key={p.platform} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p data-testid={`state-${p.platform}`} className="text-xs text-muted-foreground">
                    {state}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={p.connected ? "outline" : "default"}
                  disabled={!p.appConfigured || pending === p.platform}
                  onClick={() => void handleConnect(p.platform)}
                >
                  {p.connected ? "Reconnect" : "Connect"}
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
