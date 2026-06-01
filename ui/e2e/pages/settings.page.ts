import type { Locator, Page, Route } from "@playwright/test";

import type { AutoReplyAudit, AutoReplyConfig, BrandVoiceRulebook } from "@/lib/auto-reply";

export interface AutoReplyStubOptions {
  config?: AutoReplyConfig;
  rulebook?: BrandVoiceRulebook;
  audits?: AutoReplyAudit[];
  rejectSaveWhenBannedWordsContain?: string[];
}

function cloneRulebook(rulebook: BrandVoiceRulebook): BrandVoiceRulebook {
  return {
    tone: rulebook.tone,
    bannedWords: [...rulebook.bannedWords],
    exemplars: [...rulebook.exemplars]
  };
}

function cloneAudit(audit: AutoReplyAudit): AutoReplyAudit {
  return {
    ...audit,
    bannedHits: [...audit.bannedHits]
  };
}

function envelope(body: Record<string, unknown>): string {
  return JSON.stringify({ timestamp: new Date().toISOString(), ...body });
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeRulebook(body: Record<string, unknown>): BrandVoiceRulebook {
  return {
    tone: typeof body.tone === "string" ? body.tone.trim() : "",
    bannedWords: normalizeList(body.bannedWords),
    exemplars: normalizeList(body.exemplars)
  };
}

/** Page Object for the Settings route's auto-reply view (#78-#83). */
export class SettingsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly postureHeading: Locator;
  readonly rulebookHeading: Locator;
  readonly decisionLogHeading: Locator;
  readonly toneInput: Locator;
  readonly bannedWordsInput: Locator;
  readonly exemplarsInput: Locator;
  readonly saveButton: Locator;
  readonly savedStatus: Locator;
  readonly alert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "AI auto-reply", level: 1 });
    this.postureHeading = page.getByText("Hybrid posture", { exact: true });
    this.rulebookHeading = page.getByText("Brand voice rulebook", { exact: true });
    this.decisionLogHeading = page.getByText("Decision log", { exact: true });
    this.toneInput = page.getByLabel("Tone");
    this.bannedWordsInput = page.getByLabel("Banned words");
    this.exemplarsInput = page.getByLabel("Exemplar replies");
    this.saveButton = page.getByRole("button", { name: "Save rulebook" });
    this.savedStatus = page.getByRole("status").filter({ hasText: "Saved" });
    this.alert = page.getByRole("alert").filter({ hasText: /banned words cannot include/i });
  }

  async goto(): Promise<void> {
    await this.page.goto("/settings");
  }

  async stubAutoReply(options: AutoReplyStubOptions = {}): Promise<void> {
    const state = {
      config: options.config ?? {
        enabled: true,
        thresholds: { confidenceThreshold: 0.85, voiceThreshold: 0.8 }
      },
      rulebook: cloneRulebook(
        options.rulebook ?? { tone: "warm concise professional", bannedWords: [], exemplars: [] }
      ),
      audits: (options.audits ?? []).map(cloneAudit),
      rejectSaveWhenBannedWordsContain: new Set(options.rejectSaveWhenBannedWordsContain ?? [])
    };

    await this.page.route(/\/api\/auto-reply\/config(?:\?.*)?$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope(state.config)
      })
    );

    await this.page.route(/\/api\/auto-reply\/rulebook(?:\?.*)?$/, async (route: Route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: envelope({ rulebook: state.rulebook })
        });
        return;
      }

      const payload = route.request().postDataJSON() as Record<string, unknown>;
      const nextRulebook = normalizeRulebook(payload);
      const bannedWordHit = nextRulebook.bannedWords.find((word) =>
        state.rejectSaveWhenBannedWordsContain.has(word)
      );

      if (bannedWordHit) {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: `banned words cannot include ${bannedWordHit}` })
        });
        return;
      }

      state.rulebook = nextRulebook;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ rulebook: state.rulebook })
      });
    });

    await this.page.route(/\/api\/auto-reply\/audit\/\d+\/resolve$/, async (route: Route) => {
      const match = route.request().url().match(/\/api\/auto-reply\/audit\/(\d+)\/resolve$/);
      const id = match ? Number(match[1]) : Number.NaN;
      const payload = route.request().postDataJSON() as { approve?: boolean; editedText?: string };
      const audit = state.audits.find((entry) => entry.id === id);

      if (!audit || typeof payload.approve !== "boolean") {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid auto-reply resolve request" })
        });
        return;
      }

      audit.outcome = payload.approve ? "sent" : "rejected";
      audit.humanOverride = payload.approve && payload.editedText !== undefined;
      audit.finalText = payload.approve ? payload.editedText ?? audit.draftText : audit.finalText;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ audit })
      });
    });

    await this.page.route(/\/api\/auto-reply\/audit(?:\?.*)?$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ audits: state.audits })
      })
    );
  }

  auditRow(threadId: string): Locator {
    return this.page.getByRole("listitem").filter({ hasText: threadId });
  }

  approveButton(threadId: string): Locator {
    return this.auditRow(threadId).getByRole("button", { name: "Approve" });
  }

  rejectButton(threadId: string): Locator {
    return this.auditRow(threadId).getByRole("button", { name: "Reject" });
  }

  draftEditor(threadId: string): Locator {
    return this.auditRow(threadId).getByLabel(`Edit draft for thread ${threadId}`);
  }
}