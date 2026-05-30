"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { limitsFor, type ReplyKind } from "@/lib/inbox";

export interface ReplyComposerProps {
  platform: string;
  kind: ReplyKind;
  onSend: (body: string) => void;
  sending?: boolean;
  error?: string;
}

/**
 * Reply composer (#76). Honours the per-platform character limit for the active
 * reply kind (DM vs comment): the textarea blocks input past the limit, the
 * counter turns destructive as it approaches, and the send button is disabled
 * for empty or over-limit bodies. The actual send is delegated to the parent,
 * which routes DMs through the server's DM sender registry (#144).
 */
export function ReplyComposer({ platform, kind, onSend, sending, error }: ReplyComposerProps) {
  const limits = limitsFor(platform);
  const charLimit = kind === "dm" ? limits.dmCharLimit : limits.commentCharLimit;
  const [body, setBody] = React.useState("");

  const trimmedLength = body.trim().length;
  const overLimit = body.length > charLimit;
  const canSend = trimmedLength > 0 && !overLimit && !sending;

  const handleSend = (): void => {
    if (!canSend) return;
    onSend(body);
    setBody("");
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        handleSend();
      }}
    >
      <label htmlFor="reply-body" className="sr-only">
        Write a {kind === "dm" ? "direct message" : "comment"} reply
      </label>
      <textarea
        id="reply-body"
        aria-label={`Reply (${kind})`}
        rows={3}
        value={body}
        maxLength={charLimit}
        disabled={sending}
        placeholder={`Reply to this ${kind === "dm" ? "message" : "comment"}…`}
        onChange={(e) => setBody(e.target.value)}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex items-center justify-between gap-3">
        <span
          aria-label="characters remaining"
          className={cn(
            "text-xs tabular-nums",
            overLimit ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {body.length} / {charLimit}
        </span>
        <Button type="submit" size="sm" disabled={!canSend}>
          {sending ? "Sending…" : "Send reply"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
