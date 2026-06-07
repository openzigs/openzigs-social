/**
 * Tests for the UI backup API client functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportBackup, importBackup } from "./backup";

describe("exportBackup", () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:test-url");
    URL.revokeObjectURL = vi.fn();
    // Mock anchor element
    const mockAnchor = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, "appendChild").mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, "removeChild").mockReturnValue(mockAnchor as unknown as HTMLElement);
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("POSTs to /api/backup/export and triggers download", async () => {
    const mockBlob = new Blob(["binary-data"], { type: "application/octet-stream" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob)
    });

    await exportBackup("strongpassword");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/backup/export"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("strongpassword")
      })
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("throws on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: "passphrase too short" })
    });

    await expect(exportBackup("short")).rejects.toThrow(/passphrase too short/);
  });
});

describe("importBackup", () => {
  it("POSTs multipart and returns result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ restored: true, createdAt: "2026-06-05T00:00:00.000Z" })
    });

    const file = new File(["data"], "backup.bin");
    const result = await importBackup(file, "strongpassword");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/backup/import"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({ restored: true, createdAt: "2026-06-05T00:00:00.000Z" });
  });

  it("throws on 422 wrong passphrase", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: "Wrong passphrase or corrupted backup file." })
    });

    const file = new File(["data"], "backup.bin");
    await expect(importBackup(file, "wrongpassphrase")).rejects.toThrow(
      /Wrong passphrase or corrupted backup file/
    );
  });
});
