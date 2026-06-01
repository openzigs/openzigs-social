"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  TOUR_COPY,
  TOUR_LABELS,
  dismissTourSection,
  getTourSnapshot,
  subscribeOnboarding,
  type TourSection
} from "@/lib/onboarding";

/**
 * Contextual tour overlay (epic #100 AC). Renders a dismissible coach-mark for a
 * single section (inbox / scheduler / brand-voice). Once dismissed it stays
 * hidden (persisted in `localStorage`) until the tour is re-launched from the
 * admin panel. SSR-safe via `useSyncExternalStore`.
 */
export function TourOverlay({ section }: { section: TourSection }) {
  const state = React.useSyncExternalStore(subscribeOnboarding, getTourSnapshot, getTourSnapshot);

  if (state.dismissed.includes(section)) return null;

  return (
    <div
      role="dialog"
      aria-label={`${TOUR_LABELS[section]} tour`}
      className="relative mb-4 rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{TOUR_LABELS[section]}</p>
          <p className="mt-1 text-sm text-muted-foreground">{TOUR_COPY[section]}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Dismiss tour"
          onClick={() => dismissTourSection(section)}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
