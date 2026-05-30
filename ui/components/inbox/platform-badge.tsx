import * as React from "react";

import { badgeMetaFor } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export interface PlatformBadgeProps {
  platform: string;
  className?: string;
}

/**
 * Small coloured pill identifying a thread's source platform. There is no
 * shared Badge primitive in the design system yet, so this is a thin span.
 */
export function PlatformBadge({ platform, className }: PlatformBadgeProps) {
  const meta = badgeMetaFor(platform);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        meta.className,
        className
      )}
      data-testid="platform-badge"
    >
      {meta.label}
    </span>
  );
}
