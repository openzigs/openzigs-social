"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { BrandVoiceRulebook } from "@/lib/auto-reply";

export interface BrandVoiceEditorProps {
  /** The current rulebook to seed the form. */
  rulebook: BrandVoiceRulebook;
  /** Persist the edited rulebook. */
  onSave: (rulebook: BrandVoiceRulebook) => void;
  saving?: boolean;
  error?: string;
  /** Shown after a successful save. */
  saved?: boolean;
}

/** Split a textarea value into a trimmed, non-empty line list. */
function toList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Brand-voice rulebook editor (#83). Edits the workspace tone descriptor, the
 * banned-word list, and exemplar replies that train the Linguistic Profiler.
 * The form is presentational — persistence and live state are owned by the
 * parent so it stays trivially unit-testable.
 */
export function BrandVoiceEditor({
  rulebook,
  onSave,
  saving,
  error,
  saved
}: BrandVoiceEditorProps) {
  const [tone, setTone] = React.useState(rulebook.tone);
  const [bannedWords, setBannedWords] = React.useState(rulebook.bannedWords.join("\n"));
  const [exemplars, setExemplars] = React.useState(rulebook.exemplars.join("\n"));

  // Re-seed during render when the upstream rulebook reference changes (query
  // resolves). Adjusting state in render — rather than an effect — is the
  // React-recommended way to sync to a prop and avoids a cascading re-render.
  const [seededFrom, setSeededFrom] = React.useState(rulebook);
  if (seededFrom !== rulebook) {
    setSeededFrom(rulebook);
    setTone(rulebook.tone);
    setBannedWords(rulebook.bannedWords.join("\n"));
    setExemplars(rulebook.exemplars.join("\n"));
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    onSave({
      tone: tone.trim(),
      bannedWords: toList(bannedWords),
      exemplars: toList(exemplars)
    });
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} aria-label="Brand voice rulebook">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bv-tone" className="text-sm font-medium">
          Tone
        </label>
        <p className="text-xs text-muted-foreground">
          Descriptive words for your brand voice (e.g. “warm concise professional”).
        </p>
        <input
          id="bv-tone"
          aria-label="Tone"
          value={tone}
          disabled={saving}
          placeholder="warm concise professional"
          onChange={(e) => setTone(e.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bv-banned" className="text-sm font-medium">
          Banned words
        </label>
        <p className="text-xs text-muted-foreground">
          One per line. Any match vetoes an auto-reply (score clamps to 0).
        </p>
        <textarea
          id="bv-banned"
          aria-label="Banned words"
          rows={4}
          value={bannedWords}
          disabled={saving}
          placeholder={"act now\nlimited time\nguarantee"}
          onChange={(e) => setBannedWords(e.target.value)}
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bv-exemplars" className="text-sm font-medium">
          Exemplar replies
        </label>
        <p className="text-xs text-muted-foreground">
          One per line. Representative replies that train the voice match.
        </p>
        <textarea
          id="bv-exemplars"
          aria-label="Exemplar replies"
          rows={5}
          value={exemplars}
          disabled={saving}
          placeholder={"Thanks so much for reaching out!\nWe appreciate your patience."}
          onChange={(e) => setExemplars(e.target.value)}
          className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save rulebook"}
        </Button>
        {saved && !saving && (
          <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
            Saved
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
