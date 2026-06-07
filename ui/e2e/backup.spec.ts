/**
 * E2E coverage for the Backup & Restore feature (issue #147).
 *
 * The feature lives on the /settings page inside <BackupSection>, which
 * contains two cards:
 *   • ExportCard — encrypts and downloads the backup bundle
 *   • ImportCard — decrypts and restores a previously exported bundle
 *
 * All network calls are intercepted with `page.route()` so the suite runs
 * offline and deterministically in CI.
 *
 * AC traceability:
 *   AC-E1  Export card renders with passphrase input + download button
 *   AC-E2  Download button disabled when passphrase < 8 characters
 *   AC-E3  Valid passphrase → calls POST /api/backup/export → success message
 *   AC-E4  Export passphrase field has type="password"
 *   AC-I1  Import card renders with .bin file picker + passphrase input
 *   AC-I2  File + passphrase → calls POST /api/backup/import → success with createdAt
 *   AC-I3  Server 422 → shows "Wrong passphrase or corrupted backup file." (not raw error)
 *   AC-I4  Import passphrase field has type="password"
 */

import { expect, test } from "@playwright/test";

import { BackupPage } from "./pages/backup.page";
import { SettingsPage } from "./pages/settings.page";

test.describe("Backup & Restore (#147)", () => {
  let backup: BackupPage;
  let settings: SettingsPage;

  test.beforeEach(async ({ page }) => {
    backup = new BackupPage(page);
    settings = new SettingsPage(page);
    // Stub the auto-reply APIs so the rest of the settings page renders cleanly.
    await settings.stubAutoReply();
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Export card
  // ══════════════════════════════════════════════════════════════════════════

  test.describe("Export backup card", () => {
    // AC-E1
    test("renders the Export backup card with passphrase input and download button", async () => {
      await backup.stubExportSuccess();
      await settings.goto();

      await expect(backup.sectionHeading).toBeVisible();
      await expect(backup.exportHeading).toBeVisible();
      await expect(backup.exportPassphrase).toBeVisible();
      await expect(backup.downloadButton).toBeVisible();
    });

    // AC-E4
    test("export passphrase field has type=password", async () => {
      await settings.goto();

      await expect(backup.exportPassphrase).toHaveAttribute("type", "password");
    });

    // AC-E2
    test("download button is disabled until passphrase is at least 8 characters", async () => {
      await settings.goto();

      // Empty passphrase → disabled
      await expect(backup.downloadButton).toBeDisabled();

      // 7 characters → still disabled
      await backup.exportPassphrase.fill("short1!");
      await expect(backup.downloadButton).toBeDisabled();

      // Exactly 8 characters → enabled
      await backup.exportPassphrase.fill("valid123");
      await expect(backup.downloadButton).toBeEnabled();
    });

    // AC-E3
    test("calls POST /api/backup/export with passphrase and shows success message", async () => {
      let capturedPassphrase: string | undefined;

      await backup.page.route(/\/api\/backup\/export$/, async (route) => {
        const body = route.request().postDataJSON() as { passphrase?: string };
        capturedPassphrase = body.passphrase;
        await route.fulfill({
          status: 200,
          contentType: "application/octet-stream",
          body: Buffer.from("fake-backup-blob")
        });
      });

      await settings.goto();
      await backup.exportPassphrase.fill("strongPassphrase1");

      // Register download handler before clicking so it does not block the test.
      backup.page.on("download", (dl) => void dl.delete());

      await backup.downloadButton.click();

      await expect(backup.exportSuccess).toBeVisible();
      expect(capturedPassphrase).toBe("strongPassphrase1");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Import card
  // ══════════════════════════════════════════════════════════════════════════

  test.describe("Import backup card", () => {
    // AC-I1
    test("renders the Import backup card with .bin file picker and passphrase input", async () => {
      await settings.goto();

      await expect(backup.importHeading).toBeVisible();
      await expect(backup.importFileInput).toBeVisible();
      await expect(backup.importFileInput).toHaveAttribute("accept", ".bin");
      await expect(backup.importPassphrase).toBeVisible();
      await expect(backup.restoreButton).toBeVisible();
    });

    // AC-I4
    test("import passphrase field has type=password", async () => {
      await settings.goto();

      await expect(backup.importPassphrase).toHaveAttribute("type", "password");
    });

    // AC-I2
    test("calls POST /api/backup/import and shows success message with createdAt", async () => {
      const createdAt = "2026-01-15T10:30:00.000Z";
      await backup.stubImportSuccess(createdAt);
      await settings.goto();

      await backup.selectBinFile("my-backup.bin");
      await backup.importPassphrase.fill("strongPassphrase2");
      await backup.restoreButton.click();

      await expect(backup.importSuccess).toBeVisible();

      // Verify the createdAt timestamp is rendered in the <time> element.
      const timeEl = backup.importSuccess.locator("time");
      await expect(timeEl).toHaveAttribute("dateTime", createdAt);
    });

    // AC-I3
    test("shows friendly error message when server returns 422 — not the raw error", async () => {
      await backup.stubImport422();
      await settings.goto();

      await backup.selectBinFile();
      await backup.importPassphrase.fill("wrongPassphrase1");
      await backup.restoreButton.click();

      await expect(backup.alert("Wrong passphrase or corrupted backup file.")).toBeVisible();
    });
  });
});
