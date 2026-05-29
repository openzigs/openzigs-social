"use client";

import Link from "next/link";
import * as React from "react";

import { ProviderStep } from "@/components/setup/provider-step";
import { StepIndicator } from "@/components/setup/step-indicator";
import { TelegramStep } from "@/components/setup/telegram-step";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  INITIAL_WIZARD_STATE,
  TOTAL_STEPS,
  clearWizardState,
  getWizardSnapshot,
  subscribeWizard,
  writeWizardState,
  type SetupProvider,
  type WizardState
} from "@/lib/setup";

const STEP_LABELS = ["Welcome", "AI provider", "Telegram"] as const;

const STEP_TITLES = [
  "Welcome to openzigs-social",
  "Connect your AI provider",
  "Connect your Telegram bot"
] as const;

const STEP_DESCRIPTIONS = [
  "Three quick steps and you'll be talking to your local-first social media manager.",
  "Bring your own key. We validate it against the provider and store it encrypted on this machine.",
  "openzigs-social uses Telegram for notifications and remote control. Connect a bot to finish."
] as const;

/** Minimal first-run setup wizard shell (epic #129). */
export function SetupWizard() {
  // Persisted progress is the source of truth (survives refreshes). Reading via
  // useSyncExternalStore keeps SSR/CSR in sync without setState-in-effect.
  const state = React.useSyncExternalStore<WizardState>(
    subscribeWizard,
    getWizardSnapshot,
    () => INITIAL_WIZARD_STATE
  );
  const [done, setDone] = React.useState(false);

  const update = React.useCallback((patch: Partial<WizardState>): void => {
    writeWizardState({ ...getWizardSnapshot(), ...patch });
  }, []);

  const goNext = React.useCallback((): void => {
    const current = getWizardSnapshot();
    writeWizardState({ ...current, step: Math.min(current.step + 1, TOTAL_STEPS - 1) });
  }, []);

  const goBack = React.useCallback((): void => {
    const current = getWizardSnapshot();
    writeWizardState({ ...current, step: Math.max(current.step - 1, 0) });
  }, []);

  const finish = React.useCallback((): void => {
    clearWizardState();
    setDone(true);
  }, []);

  const canAdvance =
    state.step === 0 ||
    (state.step === 1 && state.providerValidated) ||
    (state.step === 2 && state.telegramVerified);

  if (done) {
    return (
      <Card aria-label="Setup complete">
        <CardHeader>
          <CardTitle>You&apos;re all set</CardTitle>
          <CardDescription>
            Your AI provider and Telegram bot are connected. The main app is ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild>
            <Link href="/">Go to dashboard</Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            Want the guided tour, brand-voice import, and onboarding polish? That&apos;s coming in
            the{" "}
            <Link className="underline" href="/settings">
              full setup wizard
            </Link>{" "}
            (optional).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card aria-label="Setup wizard">
      <CardHeader className="space-y-4">
        <StepIndicator current={state.step} labels={STEP_LABELS} />
        <div className="space-y-1">
          <CardTitle>{STEP_TITLES[state.step]}</CardTitle>
          <CardDescription>{STEP_DESCRIPTIONS[state.step]}</CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        {state.step === 0 && (
          <p className="text-sm text-muted-foreground">
            We&apos;ll connect your AI provider and a Telegram bot. You can change everything later
            from Settings.
          </p>
        )}
        {state.step === 1 && (
          <ProviderStep
            provider={state.provider}
            validated={state.providerValidated}
            onProviderChange={(provider: SetupProvider) =>
              update({ provider, providerValidated: false })
            }
            onValidated={() => update({ providerValidated: true })}
          />
        )}
        {state.step === 2 && (
          <TelegramStep
            verified={state.telegramVerified}
            onVerified={() => update({ telegramVerified: true })}
          />
        )}
      </CardContent>

      <CardFooter className="justify-between">
        <Button variant="outline" onClick={goBack} disabled={state.step === 0}>
          Back
        </Button>
        {state.step < TOTAL_STEPS - 1 ? (
          <Button onClick={goNext} disabled={!canAdvance}>
            Next
          </Button>
        ) : (
          <Button onClick={finish} disabled={!canAdvance}>
            Finish
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
