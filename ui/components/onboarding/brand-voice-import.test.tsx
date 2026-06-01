import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrandVoiceImport, formatForFilename } from "./brand-voice-import";
import * as lib from "@/lib/onboarding";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/onboarding", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding")>("@/lib/onboarding");
  return { ...actual, importBrandVoice: vi.fn() };
});

const importBrandVoice = vi.mocked(lib.importBrandVoice);

afterEach(() => {
  vi.clearAllMocks();
});

describe("formatForFilename", () => {
  it("detects json", () => {
    expect(formatForFilename("voice.JSON")).toBe("json");
  });
  it("defaults to csv", () => {
    expect(formatForFilename("voice.txt")).toBe("csv");
  });
});

describe("BrandVoiceImport", () => {
  it("warns when there is nothing to import", async () => {
    render(<BrandVoiceImport />);
    fireEvent.click(screen.getByRole("button", { name: /import examples/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Nothing to import" }))
    );
    expect(importBrandVoice).not.toHaveBeenCalled();
  });

  it("imports pasted content and clears the textarea", async () => {
    importBrandVoice.mockResolvedValue({
      imported: true,
      added: 2,
      rulebook: { tone: "", bannedWords: [], exemplars: ["a", "b"] }
    });
    const onComplete = vi.fn();
    render(<BrandVoiceImport onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText(/brand voice content/i), {
      target: { value: "a\nb" }
    });
    fireEvent.click(screen.getByRole("button", { name: /import examples/i }));
    await waitFor(() => expect(importBrandVoice).toHaveBeenCalledWith("csv", "a\nb"));
    expect(onComplete).toHaveBeenCalled();
    expect(screen.getByLabelText(/brand voice content/i)).toHaveValue("");
  });

  it("switches format via the dropdown", async () => {
    importBrandVoice.mockResolvedValue({
      imported: true,
      added: 1,
      rulebook: { tone: "", bannedWords: [], exemplars: ["x"] }
    });
    render(<BrandVoiceImport />);
    fireEvent.change(screen.getByLabelText(/import format/i), { target: { value: "json" } });
    fireEvent.change(screen.getByLabelText(/brand voice content/i), {
      target: { value: '["x"]' }
    });
    fireEvent.click(screen.getByRole("button", { name: /import examples/i }));
    await waitFor(() => expect(importBrandVoice).toHaveBeenCalledWith("json", '["x"]'));
  });

  it("reads an uploaded file and infers the format", async () => {
    render(<BrandVoiceImport />);
    const file = new File(['["hi"]'], "voice.json", { type: "application/json" });
    file.text = vi.fn().mockResolvedValue('["hi"]');
    const input = screen.getByLabelText(/upload brand voice file/i);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByLabelText(/brand voice content/i)).toHaveValue('["hi"]')
    );
    expect((screen.getByLabelText(/import format/i) as HTMLSelectElement).value).toBe("json");
  });

  it("reports a failed import", async () => {
    importBrandVoice.mockResolvedValue({ imported: false, error: "bad json" });
    render(<BrandVoiceImport />);
    fireEvent.change(screen.getByLabelText(/brand voice content/i), {
      target: { value: "garbage" }
    });
    fireEvent.click(screen.getByRole("button", { name: /import examples/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Import failed", description: "bad json" })
      )
    );
  });

  it("toasts when the request throws", async () => {
    importBrandVoice.mockRejectedValue(new Error("network"));
    render(<BrandVoiceImport />);
    fireEvent.change(screen.getByLabelText(/brand voice content/i), {
      target: { value: "a" }
    });
    fireEvent.click(screen.getByRole("button", { name: /import examples/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });
});
