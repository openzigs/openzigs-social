"use client";

import * as React from "react";

import { PublishTargets } from "@/components/compose/publish-targets";
import { useToast } from "@/components/ui/use-toast";
import { postLimitsFor, validatePost } from "@/lib/compose";
import { useCreatePost } from "@/lib/outbox";

/** Convert a `datetime-local` value to epoch ms, or undefined when blank. */
function toEpoch(local: string): number | undefined {
  if (!local) return undefined;
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * Per-platform composer (#87).
 *
 * Picks publish targets, writes a body, and either saves a draft or schedules
 * the post. The character counter and submit guard use the **strictest**
 * selected platform's limit, so an over-280-char body blocks submit the moment
 * X is a target — exactly the acceptance criterion. The server re-validates,
 * so this is purely a fast-feedback mirror.
 */
export function Composer() {
  const { toast } = useToast();
  const createPost = useCreatePost();
  const [targets, setTargets] = React.useState<string[]>([]);
  const [body, setBody] = React.useState("");
  const [scheduleAt, setScheduleAt] = React.useState("");

  // The strictest character cap across the selected platforms drives the
  // counter and the over-limit guard.
  const strictestLimit = React.useMemo(() => {
    if (targets.length === 0) return undefined;
    return targets.reduce(
      (min, p) => Math.min(min, postLimitsFor(p).charLimit),
      Number.POSITIVE_INFINITY
    );
  }, [targets]);

  // First failing platform validation (server uses the same rules).
  const validationError = React.useMemo(() => {
    for (const platform of targets) {
      const result = validatePost(platform, body, []);
      if (!result.ok) return result.reason ?? "post is invalid";
    }
    return undefined;
  }, [targets, body]);

  const remaining = strictestLimit === undefined ? undefined : strictestLimit - body.length;
  const overLimit = remaining !== undefined && remaining < 0;
  const canSubmit =
    targets.length > 0 && body.trim().length > 0 && !validationError && !createPost.isPending;

  async function submit(schedule: boolean): Promise<void> {
    if (!canSubmit) return;
    const publishAt = schedule ? toEpoch(scheduleAt) : undefined;
    if (schedule && publishAt === undefined) {
      toast({ title: "Pick a date and time to schedule.", variant: "destructive" });
      return;
    }
    try {
      // One outbox post per target platform — each has its own limits + queue.
      for (const platform of targets) {
        await createPost.mutateAsync({ platform, body, publishAt });
      }
      toast({
        title: schedule ? "Post scheduled" : "Draft saved",
        description: `Queued for ${targets.join(", ")}.`
      });
      setBody("");
      setScheduleAt("");
    } catch (err) {
      toast({
        title: "Could not save post",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive"
      });
    }
  }

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
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={overLimit}
          aria-describedby="compose-counter compose-hint"
        />
        <div className="flex items-center justify-between text-xs">
          <p id="compose-hint" className="text-muted-foreground" aria-live="polite">
            {targets.length === 0
              ? "Select at least one connected account to publish."
              : `Publishing to: ${targets.join(", ")}`}
          </p>
          {remaining !== undefined && (
            <p
              id="compose-counter"
              className={overLimit ? "font-medium text-destructive" : "text-muted-foreground"}
              aria-live="polite"
            >
              {remaining} characters left
            </p>
          )}
        </div>
        {validationError && (
          <p role="alert" className="text-xs text-destructive">
            {validationError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="compose-schedule" className="text-xs font-medium">
            Schedule for
          </label>
          <input
            id="compose-schedule"
            type="datetime-local"
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit}
          onClick={() => void submit(false)}
        >
          Save draft
        </button>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit || !scheduleAt}
          onClick={() => void submit(true)}
        >
          Schedule
        </button>
      </div>
    </div>
  );
}
