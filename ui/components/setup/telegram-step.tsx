"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyTelegram } from "@/lib/setup";

export interface TelegramStepProps {
  /** Called once the bot verifies + test message is delivered. */
  onVerified: () => void;
  verified: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "success"; botUsername?: string }
  | { kind: "error"; message: string };

/** Step 3: connect a Telegram bot (token + admin chat id) with verify (#104). */
export function TelegramStep({ onVerified, verified }: TelegramStepProps) {
  const [botToken, setBotToken] = React.useState("");
  const [adminChatId, setAdminChatId] = React.useState("");
  const [status, setStatus] = React.useState<Status>(
    verified ? { kind: "success" } : { kind: "idle" }
  );

  const isVerifying = status.kind === "verifying";

  async function handleVerify(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setStatus({ kind: "verifying" });
    try {
      const result = await verifyTelegram({ botToken, adminChatId });
      if (result.valid) {
        setStatus({ kind: "success", botUsername: result.botUsername });
        onVerified();
      } else {
        setStatus({
          kind: "error",
          message: result.reason ?? result.error ?? "Verification failed"
        });
      }
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server" });
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleVerify} aria-label="Connect Telegram bot">
      <div className="space-y-2">
        <Label htmlFor="setup-bot-token">Bot token</Label>
        <Input
          id="setup-bot-token"
          type="password"
          autoComplete="off"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="123456:ABC-DEF…"
          required
        />
        <p className="text-xs text-muted-foreground">
          Create a bot with @BotFather and paste its token. It is stored encrypted on this machine
          and never displayed again.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="setup-chat-id">Admin chat id</Label>
        <Input
          id="setup-chat-id"
          inputMode="numeric"
          value={adminChatId}
          onChange={(e) => setAdminChatId(e.target.value)}
          placeholder="e.g. 123456789"
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isVerifying || botToken.length === 0 || adminChatId.length === 0}
        >
          {isVerifying ? "Verifying…" : "Verify & save"}
        </Button>
        {status.kind === "success" && (
          <p role="status" className="text-sm text-primary">
            {status.botUsername ? `@${status.botUsername} connected — ` : "Connected — "}
            check Telegram for the test message.
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}
