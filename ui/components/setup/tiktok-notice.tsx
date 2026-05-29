"use client";

import * as React from "react";

/**
 * TikTok unaudited-client notice (#65).
 *
 * TikTok requires apps to pass a content-posting audit before they may publish
 * publicly. Until then, the "Unaudited Client" restriction means every post
 * this app creates is forced to PRIVATE (`SELF_ONLY`) — visible only to the
 * connected account owner. This banner makes that limitation explicit at the
 * point the user selects TikTok as a publish target so there are no surprises.
 *
 * The constraint is enforced server-side in the TikTok publisher (privacy is
 * hard-coded to `SELF_ONLY`); this component is purely informational.
 */
export function TikTokNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="TikTok publishing limitation"
      className={[
        "rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900",
        "dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
        className ?? ""
      ]
        .join(" ")
        .trim()}
    >
      <p className="font-medium">TikTok posts are private (audit pending)</p>
      <p className="mt-1">
        Until this app passes TikTok&apos;s content-posting audit, every TikTok video is published
        as <span className="font-mono">SELF_ONLY</span> — visible only to the connected account.
        Public posting unlocks once the audit is approved.
      </p>
    </div>
  );
}
