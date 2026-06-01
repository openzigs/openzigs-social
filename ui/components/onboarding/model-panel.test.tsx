import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelPanel } from "./model-panel";
import * as lib from "@/lib/onboarding";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/onboarding", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding")>("@/lib/onboarding");
  return {
    ...actual,
    fetchModelStatus: vi.fn(),
    selectModel: vi.fn(),
    pullModel: vi.fn()
  };
});

const fetchModelStatus = vi.mocked(lib.fetchModelStatus);
const selectModel = vi.mocked(lib.selectModel);
const pullModel = vi.mocked(lib.pullModel);

function status(over: Partial<lib.ModelStatus> = {}): lib.ModelStatus {
  return {
    ollama: {
      reachable: true,
      baseUrl: "http://localhost:11434",
      installedVariant: null,
      recommendedVariant: "gemma4:e4b",
      variants: ["gemma4:e8b", "gemma4:e4b", "gemma4:e2b"],
      models: []
    },
    providers: [
      { id: "openai", label: "OpenAI", configured: true },
      { id: "anthropic", label: "Anthropic", configured: false }
    ],
    selection: null,
    source: "local",
    widgets: {
      youtubeQuota: { available: false },
      byokCredit: { available: false }
    },
    ...over
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ModelPanel", () => {
  it("shows a loading state then the recommended variant", async () => {
    fetchModelStatus.mockResolvedValue(status());
    render(<ModelPanel />);
    expect(screen.getByText(/detecting local model/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("recommended-variant")).toHaveTextContent("gemma4:e4b")
    );
    expect(screen.getByTestId("ollama-state")).toHaveTextContent(/detected/i);
  });

  it("renders an error state with retry", async () => {
    fetchModelStatus.mockRejectedValueOnce(new Error("boom"));
    fetchModelStatus.mockResolvedValueOnce(status());
    render(<ModelPanel />);
    await waitFor(() => expect(screen.getByText(/couldn't reach/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByTestId("recommended-variant")).toBeInTheDocument());
  });

  it("selects the chosen model and reports completion", async () => {
    fetchModelStatus.mockResolvedValue(status());
    selectModel.mockResolvedValue({
      selected: true,
      selection: { provider: "local", model: "gemma4:e4b" }
    });
    const onComplete = vi.fn();
    render(<ModelPanel onComplete={onComplete} />);
    await waitFor(() => screen.getByRole("button", { name: /use this model/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this model/i }));
    await waitFor(() =>
      expect(selectModel).toHaveBeenCalledWith({ provider: "local", model: "gemma4:e4b" })
    );
    expect(onComplete).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Model selected" }));
  });

  it("toasts on selection failure", async () => {
    fetchModelStatus.mockResolvedValue(status());
    selectModel.mockRejectedValue(new Error("nope"));
    render(<ModelPanel />);
    await waitFor(() => screen.getByRole("button", { name: /use this model/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this model/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });

  it("offers a pull button when the variant is not installed and pulls it", async () => {
    fetchModelStatus.mockResolvedValue(status());
    pullModel.mockResolvedValue({ pulling: true, model: "gemma4:e4b", status: "success" });
    render(<ModelPanel />);
    await waitFor(() => screen.getByRole("button", { name: /pull/i }));
    fireEvent.click(screen.getByRole("button", { name: /pull/i }));
    await waitFor(() => expect(pullModel).toHaveBeenCalledWith("gemma4:e4b"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pulling model" }));
  });

  it("reports a failed pull", async () => {
    fetchModelStatus.mockResolvedValue(status());
    pullModel.mockResolvedValue({ pulling: false, model: "gemma4:e4b", error: "offline" });
    render(<ModelPanel />);
    await waitFor(() => screen.getByRole("button", { name: /pull/i }));
    fireEvent.click(screen.getByRole("button", { name: /pull/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pull failed" }))
    );
  });

  it("hides the pull button when ollama is unreachable", async () => {
    fetchModelStatus.mockResolvedValue(
      status({
        ollama: {
          reachable: false,
          baseUrl: "http://localhost:11434",
          installedVariant: null,
          recommendedVariant: "gemma4:e2b",
          variants: ["gemma4:e2b"],
          models: []
        }
      })
    );
    render(<ModelPanel />);
    await waitFor(() =>
      expect(screen.getByTestId("ollama-state")).toHaveTextContent(/not detected/i)
    );
    expect(screen.queryByRole("button", { name: /pull/i })).not.toBeInTheDocument();
  });

  it("marks configured BYOK providers", async () => {
    fetchModelStatus.mockResolvedValue(status());
    render(<ModelPanel />);
    await waitFor(() => screen.getAllByTestId("byok-chip"));
    const chips = screen.getAllByTestId("byok-chip");
    expect(chips[0]).toHaveTextContent("OpenAI ✓");
    expect(chips[1]).toHaveTextContent("Anthropic");
  });

  it("changes the selected variant via the dropdown", async () => {
    fetchModelStatus.mockResolvedValue(status());
    selectModel.mockResolvedValue({
      selected: true,
      selection: { provider: "local", model: "gemma4:e2b" }
    });
    render(<ModelPanel />);
    await waitFor(() => screen.getByLabelText(/model variant/i));
    fireEvent.change(screen.getByLabelText(/model variant/i), { target: { value: "gemma4:e2b" } });
    fireEvent.click(screen.getByRole("button", { name: /use this model/i }));
    await waitFor(() =>
      expect(selectModel).toHaveBeenCalledWith({ provider: "local", model: "gemma4:e2b" })
    );
  });
});
