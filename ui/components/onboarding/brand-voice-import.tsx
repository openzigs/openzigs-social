"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { importBrandVoice } from "@/lib/onboarding";

/** Infer the import format from an uploaded file name. */
export function formatForFilename(name: string): "json" | "csv" {
  return name.toLowerCase().endsWith(".json") ? "json" : "csv";
}

/**
 * Brand-voice import (epic #100 AC). Paste or upload a JSON/CSV document of
 * exemplars; the server parses them and merges them into the rulebook, building
 * the exemplar vocabulary the linguistic profiler scores against.
 */
export function BrandVoiceImport({ onComplete }: { onComplete?: () => void } = {}) {
  const { toast } = useToast();
  const [format, setFormat] = React.useState<"json" | "csv">("csv");
  const [content, setContent] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFormat(formatForFilename(file.name));
    setContent(await file.text());
  };

  const handleImport = async (): Promise<void> => {
    if (content.trim().length === 0) {
      toast({ title: "Nothing to import", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await importBrandVoice(format, content);
      if (result.imported) {
        toast({ title: "Brand voice imported", description: `${result.added ?? 0} new examples` });
        setContent("");
        onComplete?.();
      } else {
        toast({
          title: "Import failed",
          description: result.error ?? "No usable content",
          variant: "destructive"
        });
      }
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand voice</CardTitle>
        <CardDescription>
          Paste or upload examples of your writing. Replies learn your tone from these.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="bv-format" className="text-sm font-medium">
            Format
          </label>
          <select
            id="bv-format"
            aria-label="Import format"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={format}
            onChange={(e) => setFormat(e.target.value as "json" | "csv")}
          >
            <option value="csv">CSV (one example per line)</option>
            <option value="json">JSON</option>
          </select>
          <input
            type="file"
            aria-label="Upload brand voice file"
            accept=".json,.csv,text/csv,application/json"
            className="text-sm"
            onChange={(e) => void handleFile(e)}
          />
        </div>
        <textarea
          aria-label="Brand voice content"
          className="h-32 w-full rounded-md border border-input bg-background p-2 text-sm"
          placeholder={
            format === "json"
              ? '["First example", "Second example"]'
              : "First example\nSecond example"
          }
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <Button size="sm" disabled={busy} onClick={() => void handleImport()}>
          Import examples
        </Button>
      </CardContent>
    </Card>
  );
}
