"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import type { AutoReplyAudit } from "@/lib/auto-reply";

export interface DecisionLogProps {
  audits: AutoReplyAudit[];
  loading?: boolean;
  /** Approve (optionally with edited text) or reject a queued draft. */
  onResolve?: (id: number, approve: boolean, editedText?: string) => void;
  resolvingId?: number;
}

const OUTCOME_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{pct(value)}</span>
    </span>
  );
}

function AuditRow({
  audit,
  onResolve,
  resolving
}: {
  audit: AutoReplyAudit;
  onResolve?: DecisionLogProps["onResolve"];
  resolving: boolean;
}) {
  const [edited, setEdited] = React.useState(audit.draftText);
  const isPending = audit.outcome === "pending";

  return (
    <li className="space-y-2 rounded-md border border-border p-3" data-testid={`audit-${audit.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {audit.platform || "unknown"} · thread {audit.threadId}
        </span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            OUTCOME_STYLES[audit.outcome] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {audit.outcome}
        </span>
      </div>

      <p className="text-xs text-muted-foreground">Prompt: {audit.prompt}</p>
      <p className="text-sm">{audit.finalText ?? audit.draftText}</p>

      <div className="flex flex-wrap items-center gap-2">
        <ScoreBadge label="confidence" value={audit.confidence} />
        <ScoreBadge label="voice" value={audit.voiceMatch} />
        <span
          className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          data-testid={`decision-${audit.id}`}
        >
          {audit.decision === "auto_send" ? "auto-send" : "queued"}
        </span>
        {audit.humanOverride && (
          <span className="inline-flex rounded-md bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            human override
          </span>
        )}
        {audit.bannedHits.length > 0 && (
          <span className="inline-flex rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            banned: {audit.bannedHits.join(", ")}
          </span>
        )}
      </div>

      {isPending && onResolve && (
        <div className="space-y-2 border-t border-border pt-2">
          <label htmlFor={`edit-${audit.id}`} className="sr-only">
            Edit draft for thread {audit.threadId}
          </label>
          <textarea
            id={`edit-${audit.id}`}
            aria-label={`Edit draft for thread ${audit.threadId}`}
            rows={2}
            value={edited}
            disabled={resolving}
            onChange={(e) => setEdited(e.target.value)}
            className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={resolving}
              onClick={() =>
                onResolve(audit.id, true, edited !== audit.draftText ? edited : undefined)
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={resolving}
              onClick={() => onResolve(audit.id, false)}
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Decision log (#82/#83). Renders the auto-reply audit trail with both the
 * confidence and voice-match scores surfaced on every row, and inline
 * approve/reject controls for queued (pending) drafts — the place a human
 * reviews a draft the Hybrid posture held back.
 */
export function DecisionLog({ audits, loading, onResolve, resolvingId }: DecisionLogProps) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading decision log…</p>;
  }
  if (audits.length === 0) {
    return <p className="text-sm text-muted-foreground">No auto-reply decisions yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {audits.map((audit) => (
        <AuditRow
          key={audit.id}
          audit={audit}
          onResolve={onResolve}
          resolving={resolvingId === audit.id}
        />
      ))}
    </ul>
  );
}
