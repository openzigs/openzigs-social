"use client";

import { postLimitsFor } from "@/lib/compose";
import { cn } from "@/lib/utils";

export interface PlatformFilterProps {
  /** Platform keys to offer (in addition to the implicit "All"). */
  platforms: string[];
  /** Currently selected platform, or `undefined` for "All". */
  selected: string | undefined;
  onSelect: (platform: string | undefined) => void;
}

/**
 * Platform filter pills (#97). Selecting a platform narrows every panel; the
 * parent applies it client-side over already-fetched data so the dashboard
 * re-renders well under the 200ms target.
 */
export function PlatformFilter({ platforms, selected, onSelect }: PlatformFilterProps) {
  const options: { key: string | undefined; label: string }[] = [
    { key: undefined, label: "All platforms" },
    ...platforms.map((p) => ({ key: p, label: postLimitsFor(p).label }))
  ];

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by platform">
      {options.map((opt) => {
        const active = opt.key === selected;
        return (
          <button
            key={opt.key ?? "__all__"}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(opt.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
