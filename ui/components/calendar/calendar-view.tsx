"use client";

import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventDropArg, EventInput } from "@fullcalendar/core";

import { useSocket } from "@/app/providers";
import { useToast } from "@/components/ui/use-toast";
import { postLimitsFor } from "@/lib/compose";
import { useOutbox, useReschedulePost, type OutboxPost } from "@/lib/outbox";

/** Short, single-line preview of a post body for the calendar event title. */
function preview(post: OutboxPost): string {
  const label = postLimitsFor(post.platform).label;
  const text = post.body.replace(/\s+/g, " ").trim();
  const snippet = text.length > 40 ? `${text.slice(0, 40)}…` : text || "(no text)";
  return `${label}: ${snippet}`;
}

/**
 * Scheduling calendar (#88).
 *
 * Renders every `scheduled` (and `failed`, so the user can drag a retry to a
 * new slot) outbox post as a draggable FullCalendar event. Dragging an event
 * calls `POST /api/outbox/:id/reschedule` with the new `publish_at` — the
 * platform is never sent, so it stays put exactly as the acceptance criterion
 * requires. A failed reschedule (e.g. illegal transition) reverts the drag.
 */
export function CalendarView() {
  const socket = useSocket();
  const { toast } = useToast();
  const reschedule = useReschedulePost();
  const {
    data: posts = [],
    isLoading,
    isError,
    error
  } = useOutbox({ status: ["scheduled", "failed", "publishing"] }, socket);

  const events = React.useMemo<EventInput[]>(
    () =>
      posts
        .filter((p) => p.publishAt !== undefined)
        .map((p) => ({
          id: String(p.id),
          title: preview(p),
          start: new Date(p.publishAt as number).toISOString(),
          // Only scheduled/failed posts may move; a publishing post is locked.
          editable: p.status === "scheduled" || p.status === "failed",
          classNames: [p.status === "failed" ? "fc-event-failed" : "fc-event-scheduled"],
          extendedProps: { platform: p.platform, status: p.status }
        })),
    [posts]
  );

  async function onEventDrop(arg: EventDropArg): Promise<void> {
    const id = Number(arg.event.id);
    const start = arg.event.start;
    if (!Number.isInteger(id) || !start) {
      arg.revert();
      return;
    }
    try {
      await reschedule.mutateAsync({ id, publishAt: start.getTime() });
      toast({ title: "Post rescheduled", description: `Moved to ${start.toLocaleString()}.` });
    } catch (err) {
      arg.revert();
      toast({
        title: "Could not reschedule",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive"
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Drag a scheduled post to a new time to reschedule it.
        </p>
      </div>

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Could not load the calendar."}
        </p>
      )}
      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading calendar…
        </p>
      ) : (
        <div data-testid="calendar">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek"
            }}
            editable
            events={events}
            eventDrop={(arg) => void onEventDrop(arg)}
            height="auto"
          />
        </div>
      )}
    </div>
  );
}
