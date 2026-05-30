import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarView } from "./calendar-view";
import * as outboxLib from "@/lib/outbox";

vi.mock("@/app/providers", () => ({ useSocket: () => null }));

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

// Mock FullCalendar so we can capture the events + exercise eventDrop without
// rendering the real (heavy, jsdom-hostile) calendar widget.
let captured: { events: { id: string; title: string }[]; eventDrop: (arg: unknown) => void };
vi.mock("@fullcalendar/react", () => ({
  default: (props: {
    events: { id: string; title: string }[];
    eventDrop: (arg: unknown) => void;
  }) => {
    captured = { events: props.events, eventDrop: props.eventDrop };
    return (
      <div data-testid="fullcalendar">
        {props.events.map((e) => (
          <span key={e.id}>{e.title}</span>
        ))}
      </div>
    );
  }
}));
vi.mock("@fullcalendar/daygrid", () => ({ default: {} }));
vi.mock("@fullcalendar/timegrid", () => ({ default: {} }));
vi.mock("@fullcalendar/interaction", () => ({ default: {} }));

vi.mock("@/lib/outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outbox")>("@/lib/outbox");
  return { ...actual, useOutbox: vi.fn(), useReschedulePost: vi.fn() };
});

const useOutbox = vi.mocked(outboxLib.useOutbox);
const useReschedulePost = vi.mocked(outboxLib.useReschedulePost);

function post(over: Partial<outboxLib.OutboxPost> = {}): outboxLib.OutboxPost {
  return {
    id: 1,
    platform: "twitter",
    body: "hello",
    media: [],
    status: "scheduled",
    publishAt: new Date("2999-01-01T10:00:00Z").getTime(),
    attempts: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("CalendarView", () => {
  it("maps scheduled posts to calendar events", () => {
    useOutbox.mockReturnValue({
      data: [post({ id: 5, body: "ship it" })],
      isLoading: false,
      isError: false,
      error: null
    } as never);
    useReschedulePost.mockReturnValue({ mutateAsync: vi.fn() } as never);

    render(<CalendarView />);
    expect(screen.getByText(/X \(Twitter\): ship it/)).toBeInTheDocument();
    expect(captured.events).toHaveLength(1);
    expect(captured.events[0].id).toBe("5");
  });

  it("reschedules on event drop without changing the platform", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 5 });
    useOutbox.mockReturnValue({
      data: [post({ id: 5 })],
      isLoading: false,
      isError: false,
      error: null
    } as never);
    useReschedulePost.mockReturnValue({ mutateAsync } as never);

    render(<CalendarView />);
    const newStart = new Date("2999-02-02T12:00:00Z");
    captured.eventDrop({ event: { id: "5", start: newStart }, revert: vi.fn() });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ id: 5, publishAt: newStart.getTime() });
  });

  it("reverts the drag when reschedule fails", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("illegal transition"));
    const revert = vi.fn();
    useOutbox.mockReturnValue({
      data: [post({ id: 5 })],
      isLoading: false,
      isError: false,
      error: null
    } as never);
    useReschedulePost.mockReturnValue({ mutateAsync } as never);

    render(<CalendarView />);
    captured.eventDrop({ event: { id: "5", start: new Date() }, revert });

    await waitFor(() => expect(revert).toHaveBeenCalledTimes(1));
  });

  it("shows a loading state", () => {
    useOutbox.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null
    } as never);
    useReschedulePost.mockReturnValue({ mutateAsync: vi.fn() } as never);

    render(<CalendarView />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });
});
