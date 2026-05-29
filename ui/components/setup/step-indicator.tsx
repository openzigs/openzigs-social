import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { TOTAL_STEPS } from "@/lib/setup";

export interface StepIndicatorProps {
  /** Zero-based index of the current step. */
  current: number;
  /** Ordered step labels (length should equal {@link TOTAL_STEPS}). */
  labels: readonly string[];
}

/** Accessible 3-step progress indicator for the setup wizard (#101). */
export function StepIndicator({ current, labels }: StepIndicatorProps) {
  return (
    <ol
      className="flex items-center gap-2"
      aria-label={`Setup progress: step ${current + 1} of ${TOTAL_STEPS}`}
    >
      {labels.map((label, index) => {
        const isComplete = index < current;
        const isCurrent = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
                isComplete && "border-primary bg-primary text-primary-foreground",
                isCurrent && "border-primary text-primary",
                !isComplete && !isCurrent && "border-border text-muted-foreground"
              )}
            >
              {isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {index < labels.length - 1 && (
              <span aria-hidden="true" className="mx-1 h-px flex-1 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
