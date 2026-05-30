import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReplyComposer } from "./reply-composer";

describe("ReplyComposer", () => {
  it("disables send while the body is empty", () => {
    render(<ReplyComposer platform="instagram" kind="dm" onSend={() => {}} />);
    expect(screen.getByRole("button", { name: /send reply/i })).toBeDisabled();
  });

  it("enables send once there is non-whitespace text and fires onSend", () => {
    const onSend = vi.fn();
    render(<ReplyComposer platform="instagram" kind="dm" onSend={onSend} />);
    fireEvent.change(screen.getByLabelText("Reply (dm)"), { target: { value: "hi" } });
    const send = screen.getByRole("button", { name: /send reply/i });
    expect(send).toBeEnabled();
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith("hi");
  });

  it("uses the comment character limit for the active kind", () => {
    render(<ReplyComposer platform="twitter" kind="comment" onSend={() => {}} />);
    // X comment limit is 280.
    expect(screen.getByLabelText("characters remaining")).toHaveTextContent("0 / 280");
    expect(screen.getByLabelText("Reply (comment)")).toHaveAttribute("maxlength", "280");
  });

  it("uses the dm character limit for the active kind", () => {
    render(<ReplyComposer platform="twitter" kind="dm" onSend={() => {}} />);
    expect(screen.getByLabelText("characters remaining")).toHaveTextContent("0 / 10000");
  });

  it("disables send while a reply is in flight", () => {
    render(<ReplyComposer platform="instagram" kind="dm" onSend={() => {}} sending />);
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
  });

  it("renders an error message", () => {
    render(<ReplyComposer platform="instagram" kind="dm" onSend={() => {}} error="nope" />);
    expect(screen.getByRole("alert")).toHaveTextContent("nope");
  });
});
