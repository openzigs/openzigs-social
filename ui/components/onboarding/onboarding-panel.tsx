"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ONBOARDING_STEPS,
  STEP_LABELS,
  completeStep,
  getProgressSnapshot,
  isOnboardingComplete,
  relaunchOnboarding,
  skipStep,
  stepStatus,
  subscribeOnboarding,
  type OnboardingStep
} from "@/lib/onboarding";
import { BrandVoiceImport } from "./brand-voice-import";
import { MetaAppWizard } from "./meta-app-wizard";
import { ModelPanel } from "./model-panel";
import { RecipePicker } from "./recipe-picker";
import { SocialConnectStep } from "./social-connect-step";

const STATUS_BADGE: Record<"done" | "skipped" | "todo", string> = {
  done: "text-emerald-600",
  skipped: "text-muted-foreground",
  todo: "text-amber-600"
};

const STATUS_LABEL: Record<"done" | "skipped" | "todo", string> = {
  done: "✓",
  skipped: "skipped",
  todo: "to do"
};

/**
 * Onboarding orchestrator (epic #100). A tabbed wizard that wires every polish
 * step together. Each step is skippable and the whole flow is re-launchable
 * from the admin panel; progress persists in `localStorage`.
 */
export function OnboardingPanel() {
  const progress = React.useSyncExternalStore(
    subscribeOnboarding,
    getProgressSnapshot,
    getProgressSnapshot
  );
  const [active, setActive] = React.useState<OnboardingStep>("model");
  const complete = isOnboardingComplete(progress);

  const renderStep = (step: OnboardingStep): React.ReactNode => {
    const done = (): void => completeStep(step);
    switch (step) {
      case "model":
        return <ModelPanel onComplete={done} />;
      case "social":
        return <SocialConnectStep onComplete={done} />;
      case "meta":
        return <MetaAppWizard onComplete={done} />;
      case "recipe":
        return <RecipePicker onComplete={done} />;
      case "brand-voice":
        return <BrandVoiceImport onComplete={done} />;
      default:
        return null;
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
          <p className="text-sm text-muted-foreground">
            {complete
              ? "All steps done — re-launch any time to revisit setup."
              : "Finish setup, or skip steps you don't need right now."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => relaunchOnboarding()}>
          Re-launch tour
        </Button>
      </header>

      <Tabs value={active} onValueChange={(v) => setActive(v as OnboardingStep)}>
        <TabsList className="flex-wrap">
          {ONBOARDING_STEPS.map((step) => {
            const status = stepStatus(progress, step);
            return (
              <TabsTrigger key={step} value={step} className="gap-2">
                {STEP_LABELS[step]}
                <span data-testid={`status-${step}`} className={`text-xs ${STATUS_BADGE[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {ONBOARDING_STEPS.map((step) => (
          <TabsContent key={step} value={step} className="space-y-3">
            {renderStep(step)}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => skipStep(step)}>
                Skip this step
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
