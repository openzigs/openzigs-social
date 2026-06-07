import type { Locator, Page, Route } from "@playwright/test";

/**
 * Page Object for the Backup & Restore section on the Settings page (#147).
 *
 * Encapsulates all locators and route stubs for the ExportCard and ImportCard
 * components. All network calls are intercepted with `page.route()` so tests
 * run offline and deterministically in CI.
 */
export class BackupPage {
  readonly page: Page;

  // ── Section ─────────────────────────────────────────────────────────────
  readonly sectionHeading: Locator;

  // ── Export card ──────────────────────────────────────────────────────────
  readonly exportHeading: Locator;
  readonly exportPassphrase: Locator;
  readonly downloadButton: Locator;
  readonly exportSuccess: Locator;

  // ── Import card ──────────────────────────────────────────────────────────
  readonly importHeading: Locator;
  readonly importFileInput: Locator;
  readonly importPassphrase: Locator;
  readonly restoreButton: Locator;
  readonly importSuccess: Locator;

  constructor(page: Page) {
    this.page = page;

    this.sectionHeading = page.getByRole("heading", { name: "Backup & Restore" });

    // Export
    this.exportHeading = page.getByRole("heading", { name: "Export backup" });
    this.exportPassphrase = page.getByLabel("Encryption passphrase");
    this.downloadButton = page.getByRole("button", { name: "Download backup" });
    this.exportSuccess = page
      .getByRole("status")
      .filter({ hasText: "Backup downloaded successfully." });

    // Import
    this.importHeading = page.getByRole("heading", { name: "Import backup" });
    this.importFileInput = page.getByLabel("Backup file (.bin)");
    this.importPassphrase = page.getByLabel("Decryption passphrase");
    this.restoreButton = page.getByRole("button", { name: "Restore backup" });
    this.importSuccess = page
      .getByRole("status")
      .filter({ hasText: "Backup restored successfully." });
  }

  /** Returns an alert locator filtered to the given text. */
  alert(text: string | RegExp): Locator {
    return this.page.getByRole("alert").filter({ hasText: text });
  }

  // ── Route stubs ──────────────────────────────────────────────────────────

  /** Stub POST /api/backup/export to return a fake binary blob. */
  async stubExportSuccess(): Promise<void> {
    await this.page.route(/\/api\/backup\/export$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from("fake-backup-blob")
      })
    );
  }

  /**
   * Stub POST /api/backup/import to return a successful restore result.
   *
   * @param createdAt ISO-8601 timestamp of the backup's creation date.
   */
  async stubImportSuccess(createdAt = "2026-01-15T10:30:00.000Z"): Promise<void> {
    await this.page.route(/\/api\/backup\/import$/, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ restored: true, createdAt })
      })
    );
  }

  /** Stub POST /api/backup/import to return 422 with the wrong-passphrase error body. */
  async stubImport422(): Promise<void> {
    await this.page.route(/\/api\/backup\/import$/, (route: Route) =>
      route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "Wrong passphrase or corrupted backup file." })
      })
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Attach a fake `.bin` file to the import file input via `setInputFiles`.
   * The browser file-chooser is bypassed entirely — no dialog appears.
   */
  async selectBinFile(name = "backup.bin"): Promise<void> {
    await this.importFileInput.setInputFiles({
      name,
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake-backup-data")
    });
  }
}
