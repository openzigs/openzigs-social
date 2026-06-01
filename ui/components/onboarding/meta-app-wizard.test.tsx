import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MetaAppWizard } from "./meta-app-wizard";
import * as lib from "@/lib/onboarding";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/onboarding", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding")>("@/lib/onboarding");
  return { ...actual, saveMetaApp: vi.fn() };
});

const saveMetaApp = vi.mocked(lib.saveMetaApp);

afterEach(() => {
  vi.clearAllMocks();
});

function fillForm(): void {
  fireEvent.change(screen.getByLabelText("App ID"), { target: { value: "12345" } });
  fireEvent.change(screen.getByLabelText("App Secret"), { target: { value: "shh-secret" } });
}

describe("MetaAppWizard", () => {
  it("renders the numbered steps with screenshot placeholders", () => {
    render(<MetaAppWizard />);
    expect(screen.getByText(/create an app/i)).toBeInTheDocument();
    expect(screen.getAllByTestId("screenshot-placeholder")).toHaveLength(4);
  });

  it("keeps submit disabled until both fields are filled", () => {
    render(<MetaAppWizard />);
    expect(screen.getByRole("button", { name: /save meta app/i })).toBeDisabled();
    fillForm();
    expect(screen.getByRole("button", { name: /save meta app/i })).toBeEnabled();
  });

  it("saves the app and shows scopes + redirect URIs", async () => {
    saveMetaApp.mockResolvedValue({
      stored: true,
      appId: "12345",
      scopes: ["instagram_basic", "pages_show_list"],
      redirectUris: [
        { platform: "instagram", redirectUri: "http://localhost/oauth/callback/instagram" }
      ]
    });
    const onComplete = vi.fn();
    render(<MetaAppWizard onComplete={onComplete} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /save meta app/i }));
    await waitFor(() => expect(saveMetaApp).toHaveBeenCalledWith("12345", "shh-secret"));
    expect(onComplete).toHaveBeenCalled();
    expect(screen.getByTestId("meta-scopes")).toHaveTextContent("instagram_basic,pages_show_list");
    expect(screen.getByText("http://localhost/oauth/callback/instagram")).toBeInTheDocument();
  });

  it("clears the secret field after a successful save", async () => {
    saveMetaApp.mockResolvedValue({
      stored: true,
      appId: "12345",
      scopes: [],
      redirectUris: []
    });
    render(<MetaAppWizard />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /save meta app/i }));
    await waitFor(() => expect(screen.getByLabelText("App Secret")).toHaveValue(""));
  });

  it("toasts on save failure", async () => {
    saveMetaApp.mockRejectedValue(new Error("nope"));
    render(<MetaAppWizard />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /save meta app/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });

  it("copies scopes to the clipboard", async () => {
    saveMetaApp.mockResolvedValue({
      stored: true,
      appId: "12345",
      scopes: ["a", "b"],
      redirectUris: []
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MetaAppWizard />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /save meta app/i }));
    await waitFor(() => screen.getByRole("button", { name: /^copy$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("a,b"));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Scopes copied" }));
  });

  it("reports a clipboard failure", async () => {
    saveMetaApp.mockResolvedValue({
      stored: true,
      appId: "12345",
      scopes: ["a"],
      redirectUris: []
    });
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    render(<MetaAppWizard />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /save meta app/i }));
    await waitFor(() => screen.getByRole("button", { name: /^copy$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Copy failed" }))
    );
  });

  it("handles a stored:false response", async () => {
    saveMetaApp.mockResolvedValue({ stored: false } as unknown as lib.SaveMetaAppResult);
    render(<MetaAppWizard />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /save meta app/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });
});
