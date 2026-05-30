import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Composer } from "./composer";
import * as outboxLib from "@/lib/outbox";
import * as connectionsApi from "@/lib/connections";
import type { ConnectionSummary } from "@/lib/connections";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/outbox", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outbox")>("@/lib/outbox");
  return { ...actual, useCreatePost: vi.fn() };
});

const useCreatePost = vi.mocked(outboxLib.useCreatePost);

const CONNECTIONS: ConnectionSummary[] = [
  { platform: "twitter", label: "X (Twitter)", connected: true, needsReconsent: false },
  { platform: "linkedin", label: "LinkedIn", connected: true, needsReconsent: false }
];

function mockMutation(mutateAsync = vi.fn().mockResolvedValue({ id: 1 })) {
  useCreatePost.mockReturnValue({ mutateAsync, isPending: false } as never);
  return mutateAsync;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Composer", () => {
  it("blocks submit and shows the limit error for an over-280-char X post", async () => {
    mockMutation();
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);

    render(<Composer />);
    fireEvent.click(await screen.findByLabelText(/X \(Twitter\)/));

    const textarea = screen.getByLabelText("Post");
    fireEvent.change(textarea, { target: { value: "x".repeat(281) } });

    expect(screen.getByText(/-1 characters left/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/280 character limit/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });

  it("shows the strictest remaining count across selected platforms", async () => {
    mockMutation();
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);

    render(<Composer />);
    fireEvent.click(await screen.findByLabelText(/X \(Twitter\)/));
    fireEvent.change(screen.getByLabelText("Post"), { target: { value: "hello" } });

    // X (280) is stricter than LinkedIn (3000): 280 - 5 = 275.
    expect(screen.getByText(/275 characters left/)).toBeInTheDocument();
  });

  it("creates one draft per selected platform on Save draft", async () => {
    const mutateAsync = mockMutation();
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);

    render(<Composer />);
    fireEvent.click(await screen.findByLabelText(/X \(Twitter\)/));
    fireEvent.click(screen.getByLabelText(/LinkedIn/));
    fireEvent.change(screen.getByLabelText("Post"), { target: { value: "hi all" } });

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync).toHaveBeenCalledWith({
      platform: "twitter",
      body: "hi all",
      publishAt: undefined
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      platform: "linkedin",
      body: "hi all",
      publishAt: undefined
    });
  });

  it("schedules with an epoch publishAt when a date is chosen", async () => {
    const mutateAsync = mockMutation();
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);

    render(<Composer />);
    fireEvent.click(await screen.findByLabelText(/X \(Twitter\)/));
    fireEvent.change(screen.getByLabelText("Post"), { target: { value: "later" } });
    fireEvent.change(screen.getByLabelText("Schedule for"), {
      target: { value: "2999-01-01T10:00" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Schedule" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const call = mutateAsync.mock.calls[0][0] as { publishAt: number };
    expect(call.publishAt).toBe(new Date("2999-01-01T10:00").getTime());
  });

  it("keeps submit disabled until a target and body exist", async () => {
    mockMutation();
    vi.spyOn(connectionsApi, "fetchConnections").mockResolvedValue(CONNECTIONS);

    render(<Composer />);
    await screen.findByLabelText(/X \(Twitter\)/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  });
});
