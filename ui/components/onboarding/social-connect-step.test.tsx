import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SocialConnectStep } from "./social-connect-step";
import * as lib from "@/lib/onboarding";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/onboarding", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding")>("@/lib/onboarding");
  return {
    ...actual,
    fetchSocialSetupStatus: vi.fn(),
    authorizePlatform: vi.fn()
  };
});

const fetchSocialSetupStatus = vi.mocked(lib.fetchSocialSetupStatus);
const authorizePlatform = vi.mocked(lib.authorizePlatform);

function platform(over: Partial<lib.PlatformSetupStatus> = {}): lib.PlatformSetupStatus {
  return {
    platform: "instagram",
    label: "Instagram",
    appConfigured: true,
    connected: false,
    needsReconsent: false,
    scopes: ["instagram_basic"],
    redirectUri: "http://localhost/oauth/callback/instagram",
    ...over
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("SocialConnectStep", () => {
  it("lists platforms with their state", async () => {
    fetchSocialSetupStatus.mockResolvedValue({
      timestamp: "t",
      platforms: [
        platform(),
        platform({ platform: "facebook", label: "Facebook", appConfigured: false }),
        platform({ platform: "linkedin", label: "LinkedIn", connected: true }),
        platform({ platform: "twitter", label: "X", needsReconsent: true })
      ]
    } as lib.SocialSetupStatus);
    render(<SocialConnectStep />);
    await waitFor(() => expect(screen.getByText("Instagram")).toBeInTheDocument());
    expect(screen.getByTestId("state-instagram")).toHaveTextContent(/ready to connect/i);
    expect(screen.getByTestId("state-facebook")).toHaveTextContent(/not configured/i);
    expect(screen.getByTestId("state-linkedin")).toHaveTextContent(/connected/i);
    expect(screen.getByTestId("state-twitter")).toHaveTextContent(/reconnect/i);
  });

  it("disables connect when the app is not configured", async () => {
    fetchSocialSetupStatus.mockResolvedValue({
      timestamp: "t",
      platforms: [platform({ platform: "facebook", label: "Facebook", appConfigured: false })]
    } as lib.SocialSetupStatus);
    render(<SocialConnectStep />);
    await waitFor(() => screen.getByRole("button", { name: /connect/i }));
    expect(screen.getByRole("button", { name: /connect/i })).toBeDisabled();
  });

  it("authorizes a platform and opens the url", async () => {
    fetchSocialSetupStatus.mockResolvedValue({
      timestamp: "t",
      platforms: [platform()]
    } as lib.SocialSetupStatus);
    authorizePlatform.mockResolvedValue({
      platform: "instagram",
      url: "https://auth.example/go",
      state: "s",
      redirectUri: "http://localhost/oauth/callback/instagram",
      scopes: ["instagram_basic"]
    });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const onComplete = vi.fn();
    render(<SocialConnectStep onComplete={onComplete} />);
    await waitFor(() => screen.getByRole("button", { name: /connect/i }));
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() => expect(authorizePlatform).toHaveBeenCalledWith("instagram"));
    expect(open).toHaveBeenCalledWith("https://auth.example/go", "_blank", "noopener,noreferrer");
    expect(onComplete).toHaveBeenCalled();
    open.mockRestore();
  });

  it("toasts when authorization fails", async () => {
    fetchSocialSetupStatus.mockResolvedValue({
      timestamp: "t",
      platforms: [platform()]
    } as lib.SocialSetupStatus);
    authorizePlatform.mockRejectedValue(new Error("nope"));
    render(<SocialConnectStep />);
    await waitFor(() => screen.getByRole("button", { name: /connect/i }));
    fireEvent.click(screen.getByRole("button", { name: /connect/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });

  it("renders an error state with retry", async () => {
    fetchSocialSetupStatus.mockRejectedValueOnce(new Error("boom"));
    fetchSocialSetupStatus.mockResolvedValueOnce({
      timestamp: "t",
      platforms: [platform()]
    } as lib.SocialSetupStatus);
    render(<SocialConnectStep />);
    await waitFor(() => expect(screen.getByText(/couldn't load platform/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByText("Instagram")).toBeInTheDocument());
  });
});
