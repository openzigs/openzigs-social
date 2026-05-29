"use client";

import * as React from "react";

import { PublishTargets } from "@/components/compose/publish-targets";

export default function ComposePage() {
  const [targets, setTargets] = React.useState<string[]>([]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Compose</h1>
        <p className="text-sm text-muted-foreground">
          Choose where to publish, then write your post.
        </p>
      </div>

      <PublishTargets onSelectionChange={setTargets} />

      <div className="space-y-2">
        <label htmlFor="compose-body" className="text-sm font-medium">
          Post
        </label>
        <textarea
          id="compose-body"
          className="min-h-32 w-full rounded-md border border-input bg-background p-3 text-sm"
          placeholder="What's on your mind?"
        />
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {targets.length === 0
            ? "Select at least one connected account to publish."
            : `Publishing to: ${targets.join(", ")}`}
        </p>
      </div>
    </div>
  );
}
