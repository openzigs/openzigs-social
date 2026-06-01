import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BrandVoiceEditor } from "./brand-voice-editor";

const EMPTY = { tone: "", bannedWords: [], exemplars: [] };

describe("BrandVoiceEditor", () => {
  it("seeds the fields from the rulebook", () => {
    render(
      <BrandVoiceEditor
        rulebook={{ tone: "warm", bannedWords: ["spam", "act now"], exemplars: ["hi"] }}
        onSave={() => {}}
      />
    );
    expect(screen.getByLabelText("Tone")).toHaveValue("warm");
    expect(screen.getByLabelText("Banned words")).toHaveValue("spam\nact now");
    expect(screen.getByLabelText("Exemplar replies")).toHaveValue("hi");
  });

  it("submits a normalised rulebook, splitting lists by line and dropping blanks", () => {
    const onSave = vi.fn();
    render(<BrandVoiceEditor rulebook={EMPTY} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Tone"), { target: { value: "  warm concise  " } });
    fireEvent.change(screen.getByLabelText("Banned words"), {
      target: { value: "spam\n\n  act now  \n" }
    });
    fireEvent.change(screen.getByLabelText("Exemplar replies"), {
      target: { value: "Thanks!\n" }
    });
    fireEvent.click(screen.getByRole("button", { name: /save rulebook/i }));
    expect(onSave).toHaveBeenCalledWith({
      tone: "warm concise",
      bannedWords: ["spam", "act now"],
      exemplars: ["Thanks!"]
    });
  });

  it("disables the save button and inputs while saving", () => {
    render(<BrandVoiceEditor rulebook={EMPTY} onSave={() => {}} saving />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(screen.getByLabelText("Tone")).toBeDisabled();
  });

  it("shows the saved confirmation", () => {
    render(<BrandVoiceEditor rulebook={EMPTY} onSave={() => {}} saved />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("renders an error", () => {
    render(<BrandVoiceEditor rulebook={EMPTY} onSave={() => {}} error="nope" />);
    expect(screen.getByRole("alert")).toHaveTextContent("nope");
  });
});
