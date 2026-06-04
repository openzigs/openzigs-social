import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipePicker } from "./recipe-picker";
import * as lib from "@/lib/onboarding";

const toast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("@/lib/onboarding", async () => {
  const actual = await vi.importActual<typeof import("@/lib/onboarding")>("@/lib/onboarding");
  return { ...actual, fetchRecipes: vi.fn(), applyRecipe: vi.fn() };
});

const fetchRecipes = vi.mocked(lib.fetchRecipes);
const applyRecipe = vi.mocked(lib.applyRecipe);

function recipe(over: Partial<lib.StarterRecipe> = {}): lib.StarterRecipe {
  return {
    id: "creator",
    label: "Creator",
    description: "Solo creator preset",
    tone: "Playful and direct",
    bannedWords: [],
    exemplars: ["hey friends"],
    suggestedPlatforms: ["instagram", "tiktok"],
    cadencePerWeek: 7,
    ...over
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("RecipePicker", () => {
  it("renders the recipe cards", async () => {
    fetchRecipes.mockResolvedValue([
      recipe(),
      recipe({ id: "small-biz", label: "Small Biz" }),
      recipe({ id: "agency", label: "Agency" })
    ]);
    render(<RecipePicker />);
    await waitFor(() => expect(screen.getByTestId("recipe-creator")).toBeInTheDocument());
    expect(screen.getByTestId("recipe-small-biz")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-agency")).toBeInTheDocument();
  });

  it("applies a recipe and marks it applied", async () => {
    fetchRecipes.mockResolvedValue([recipe()]);
    applyRecipe.mockResolvedValue({
      applied: true,
      recipe: "creator",
      rulebook: { tone: "Playful and direct", bannedWords: [], exemplars: ["hey friends"] },
      suggestedPlatforms: ["instagram", "tiktok"],
      cadencePerWeek: 7
    });
    const onComplete = vi.fn();
    render(<RecipePicker onComplete={onComplete} />);
    await waitFor(() => screen.getByRole("button", { name: /use this recipe/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this recipe/i }));
    await waitFor(() => expect(applyRecipe).toHaveBeenCalledWith("creator"));
    expect(onComplete).toHaveBeenCalled();
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-apply/i })).toBeInTheDocument();
  });

  it("toasts on apply failure", async () => {
    fetchRecipes.mockResolvedValue([recipe()]);
    applyRecipe.mockRejectedValue(new Error("nope"));
    render(<RecipePicker />);
    await waitFor(() => screen.getByRole("button", { name: /use this recipe/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this recipe/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    );
  });

  it("handles an applied:false response", async () => {
    fetchRecipes.mockResolvedValue([recipe()]);
    applyRecipe.mockResolvedValue({ applied: false } as unknown as lib.ApplyRecipeResult);
    render(<RecipePicker />);
    await waitFor(() => screen.getByRole("button", { name: /use this recipe/i }));
    fireEvent.click(screen.getByRole("button", { name: /use this recipe/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not apply recipe" })
      )
    );
  });

  it("renders an error state with retry", async () => {
    fetchRecipes.mockRejectedValueOnce(new Error("boom"));
    fetchRecipes.mockResolvedValueOnce([recipe()]);
    render(<RecipePicker />);
    await waitFor(() => expect(screen.getByText(/couldn't load recipes/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.getByTestId("recipe-creator")).toBeInTheDocument());
  });
});
