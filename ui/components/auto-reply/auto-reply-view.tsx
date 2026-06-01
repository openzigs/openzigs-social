"use client";

import * as React from "react";

import { useSocket } from "@/app/providers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandVoiceEditor } from "@/components/auto-reply/brand-voice-editor";
import { DecisionLog } from "@/components/auto-reply/decision-log";
import {
  EMPTY_RULEBOOK,
  useAuditLog,
  useAutoReplyConfig,
  useResolveAudit,
  useRulebook,
  useSaveRulebook
} from "@/lib/auto-reply";

/**
 * Auto-reply settings view (#83). Composes the brand-voice rulebook editor with
 * the live decision log, and surfaces the current Hybrid posture + thresholds.
 * Hosted on the existing Settings page — no new nav route.
 */
export function AutoReplyView() {
  const socket = useSocket();
  const config = useAutoReplyConfig();
  const rulebook = useRulebook();
  const saveRulebook = useSaveRulebook();
  const audit = useAuditLog({}, socket);
  const resolve = useResolveAudit();

  const thresholds = config.data?.thresholds;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI auto-reply</h1>
        <p className="text-sm text-muted-foreground">
          Teach your brand voice and review what the Hybrid posture sends or holds for approval.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hybrid posture</CardTitle>
          <CardDescription>
            {config.isLoading
              ? "Loading…"
              : config.data?.enabled
                ? "Enabled — high-scoring drafts auto-send."
                : "Disabled — every draft is queued for approval."}
          </CardDescription>
        </CardHeader>
        {thresholds && (
          <CardContent className="flex gap-4 text-sm text-muted-foreground">
            <span>
              Confidence ≥{" "}
              <span className="font-medium text-foreground">
                {Math.round(thresholds.confidenceThreshold * 100)}%
              </span>
            </span>
            <span>
              Voice ≥{" "}
              <span className="font-medium text-foreground">
                {Math.round(thresholds.voiceThreshold * 100)}%
              </span>
            </span>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand voice rulebook</CardTitle>
          <CardDescription>Tone, banned words, and exemplar replies.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandVoiceEditor
            rulebook={rulebook.data ?? EMPTY_RULEBOOK}
            onSave={(next) => saveRulebook.mutate(next)}
            saving={saveRulebook.isPending}
            saved={saveRulebook.isSuccess}
            error={saveRulebook.error instanceof Error ? saveRulebook.error.message : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision log</CardTitle>
          <CardDescription>
            Every auto-reply decision with its confidence and voice scores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionLog
            audits={audit.data ?? []}
            loading={audit.isLoading}
            onResolve={(id, approve, editedText) => resolve.mutate({ id, approve, editedText })}
            resolvingId={resolve.isPending ? resolve.variables?.id : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
