"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PROVIDER_LABELS,
  SETUP_PROVIDERS,
  validateProviderKey,
  type SetupProvider
} from "@/lib/setup";

export interface ProviderStepProps {
  provider: SetupProvider;
  onProviderChange: (provider: SetupProvider) => void;
  /** Called once the key validates + stores successfully. */
  onValidated: () => void;
  validated: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "success"; provider: SetupProvider }
  | { kind: "error"; message: string };

/** Step 2: pick an LLM provider and enter a BYOK key (#103). */
export function ProviderStep({
  provider,
  onProviderChange,
  onValidated,
  validated
}: ProviderStepProps) {
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [status, setStatus] = React.useState<Status>(
    validated ? { kind: "success", provider } : { kind: "idle" }
  );

  const needsBaseUrl = provider === "openai-compatible";
  const isValidating = status.kind === "validating";

  async function handleValidate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setStatus({ kind: "validating" });
    try {
      const result = await validateProviderKey({
        provider,
        apiKey,
        ...(needsBaseUrl ? { baseUrl } : {})
      });
      if (result.valid) {
        setStatus({ kind: "success", provider });
        onValidated();
      } else {
        setStatus({ kind: "error", message: result.reason ?? result.error ?? "Validation failed" });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server" });
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleValidate} aria-label="Choose LLM provider">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Provider</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="LLM provider">
          {SETUP_PROVIDERS.map((p) => (
            <Button
              key={p}
              type="button"
              role="radio"
              aria-checked={provider === p}
              variant={provider === p ? "default" : "outline"}
              onClick={() => onProviderChange(p)}
            >
              {PROVIDER_LABELS[p]}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="setup-api-key">API key</Label>
        <Input
          id="setup-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your BYOK key"
          required
        />
        <p className="text-xs text-muted-foreground">
          Your key is sent to the local server, validated against the provider, and stored encrypted
          on this machine. It never leaves your device beyond the provider check.
        </p>
      </div>

      {needsBaseUrl && (
        <div className="space-y-2">
          <Label htmlFor="setup-base-url">Base URL</Label>
          <Input
            id="setup-base-url"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            required
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isValidating || apiKey.length === 0}>
          {isValidating ? "Validating…" : "Validate & save"}
        </Button>
        {status.kind === "success" && (
          <p role="status" className="text-sm text-primary">
            {PROVIDER_LABELS[status.provider]} key validated and saved.
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}
