import { expect, test } from "@playwright/test";

import type { AutoReplyAudit } from "@/lib/auto-reply";

import { SettingsPage } from "./pages/settings.page";

function audit(overrides: Partial<AutoReplyAudit> = {}): AutoReplyAudit {
  return {
    id: 1,
    threadId: "thread-1",
    platform: "twitter",
    prompt: "Can you help me with this?",
    draftText: "Thanks for reaching out. We can help.",
    confidence: 0.92,
    voiceMatch: 0.85,
    toneMatch: 0.85,
    bannedHits: [],
    decision: "auto_send",
    humanOverride: false,
    outcome: "sent",
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

test.describe("Auto-reply settings (#78-#83)", () => {
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    settings = new SettingsPage(page);
  });

  // AC: The brand-voice rulebook editor loads, lets the user edit tone + banned words + exemplars, and saves successfully with persisted values after reload.
  test("loads, edits, saves, and persists the brand-voice rulebook", async () => {
    await settings.stubAutoReply({
      rulebook: {
        tone: "warm concise professional",
        bannedWords: ["spam"],
        exemplars: ["Thanks for the note."]
      }
    });
    await settings.goto();

    await expect(settings.heading).toBeVisible();
    await expect(settings.rulebookHeading).toBeVisible();
    await expect(settings.toneInput).toHaveValue("warm concise professional");
    await expect(settings.bannedWordsInput).toHaveValue("spam");
    await expect(settings.exemplarsInput).toHaveValue("Thanks for the note.");

    await test.step("edit and save the rulebook", async () => {
      await settings.toneInput.fill("calm direct helpful");
      await settings.bannedWordsInput.fill("spam\nact now");
      await settings.exemplarsInput.fill("Thanks for reaching out.\nWe appreciate the context.");
      await settings.saveButton.click();
      await expect(settings.savedStatus).toBeVisible();
    });

    await test.step("reload and verify the persisted values", async () => {
      await settings.page.reload();
      await expect(settings.toneInput).toHaveValue("calm direct helpful");
      await expect(settings.bannedWordsInput).toHaveValue("spam\nact now");
      await expect(settings.exemplarsInput).toHaveValue(
        "Thanks for reaching out.\nWe appreciate the context."
      );
    });
  });

  // AC: The decision log displays queued drafts with BOTH scores shown as percentages.
  // AC: The Hybrid posture card surfaces the configured confidence and voice thresholds.
  test("shows the Hybrid thresholds and queued drafts with both scores as percentages", async () => {
    await settings.stubAutoReply({
      audits: [
        audit({
          id: 11,
          threadId: "thread-auto",
          confidence: 0.92,
          voiceMatch: 0.85,
          decision: "auto_send",
          outcome: "sent",
          finalText: "Thanks for reaching out. We can help."
        }),
        audit({
          id: 12,
          threadId: "thread-queued",
          confidence: 0.6,
          voiceMatch: 0.72,
          decision: "queue",
          outcome: "pending"
        })
      ]
    });
    await settings.goto();

    await expect(settings.postureHeading).toBeVisible();
    await expect(settings.page.getByText(/Confidence ≥ 85%/)).toBeVisible();
    await expect(settings.page.getByText(/Voice ≥ 80%/)).toBeVisible();

    const queuedRow = settings.auditRow("thread-queued");
    await expect(queuedRow).toContainText("60%");
    await expect(queuedRow).toContainText("72%");
    await expect(queuedRow).toContainText("queued");
    await expect(settings.approveButton("thread-queued")).toBeVisible();
    await expect(settings.rejectButton("thread-queued")).toBeVisible();

    const autoRow = settings.auditRow("thread-auto");
    await expect(autoRow).toContainText("92%");
    await expect(autoRow).toContainText("85%");
    await expect(autoRow).toContainText("sent");
  });

  // AC: A queued draft (low confidence) can be approved via the UI controls.
  test("approves a queued draft without editing", async () => {
    await settings.stubAutoReply({
      audits: [
        audit({
          id: 21,
          threadId: "thread-approve",
          confidence: 0.6,
          voiceMatch: 0.72,
          decision: "queue",
          outcome: "pending"
        })
      ]
    });
    await settings.goto();

    await settings.approveButton("thread-approve").click();
    await expect(settings.auditRow("thread-approve")).toContainText("sent");
    await expect(settings.auditRow("thread-approve")).not.toContainText("Approve");
    await expect(settings.auditRow("thread-approve")).not.toContainText("Reject");
  });

  // AC: A queued draft can be edited and then approved through the decision log.
  test("edits a queued draft and approves the edited reply", async () => {
    await settings.stubAutoReply({
      audits: [
        audit({
          id: 22,
          threadId: "thread-edit",
          draftText: "Thanks for the note. We can help.",
          confidence: 0.5,
          voiceMatch: 0.68,
          decision: "queue",
          outcome: "pending"
        })
      ]
    });
    await settings.goto();

    const draftEditor = settings.draftEditor("thread-edit");
    await draftEditor.fill("Thanks for the note. We will take care of this today.");
    await settings.approveButton("thread-edit").click();

    const row = settings.auditRow("thread-edit");
    await expect(row).toContainText("Thanks for the note. We will take care of this today.");
    await expect(row).toContainText("sent");
    await expect(row).toContainText("human override");
  });

  // AC: A queued draft can be rejected via the UI controls.
  test("rejects a queued draft", async () => {
    await settings.stubAutoReply({
      audits: [
        audit({
          id: 23,
          threadId: "thread-reject",
          confidence: 0.48,
          voiceMatch: 0.65,
          decision: "queue",
          outcome: "pending"
        })
      ]
    });
    await settings.goto();

    await settings.rejectButton("thread-reject").click();
    const row = settings.auditRow("thread-reject");
    await expect(row).toContainText("rejected");
    await expect(row).not.toContainText("Approve");
    await expect(row).not.toContainText("Reject");
  });

  // AC: Banned-word validation surfaces in the editor.
  test("surfaces a banned-word validation error in the editor", async () => {
    await settings.stubAutoReply({
      rejectSaveWhenBannedWordsContain: ["spam"]
    });
    await settings.goto();

    await settings.bannedWordsInput.fill("spam\nact now");
    await settings.saveButton.click();

    await expect(settings.alert).toBeVisible();
    await expect(settings.alert).toHaveText(/banned words cannot include spam/i);
  });
});