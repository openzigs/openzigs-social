import { SetupWizard } from "@/components/setup/setup-wizard";

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="text-sm text-muted-foreground">
          Get openzigs-social connected in three quick steps.
        </p>
      </div>
      <SetupWizard />
    </div>
  );
}
