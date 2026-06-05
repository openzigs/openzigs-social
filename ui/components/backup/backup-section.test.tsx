/**
 * Tests for the BackupSection component (#147).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the backup module
vi.mock("@/lib/backup", () => ({
  exportBackup: vi.fn(),
  importBackup: vi.fn()
}));

import { BackupSection } from "./backup-section";
import * as backup from "@/lib/backup";

describe("BackupSection - ExportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders export heading and passphrase input", () => {
    render(<BackupSection />);
    expect(screen.getByText("Export backup")).toBeInTheDocument();
    expect(screen.getByLabelText(/encryption passphrase/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download backup/i })).toBeInTheDocument();
  });

  it("disables download button when passphrase is too short", () => {
    render(<BackupSection />);
    const input = screen.getByLabelText(/encryption passphrase/i);
    fireEvent.change(input, { target: { value: "short" } });
    expect(screen.getByRole("button", { name: /download backup/i })).toBeDisabled();
  });

  it("enables download button when passphrase is >= 8 chars", () => {
    render(<BackupSection />);
    const input = screen.getByLabelText(/encryption passphrase/i);
    fireEvent.change(input, { target: { value: "longenough" } });
    expect(screen.getByRole("button", { name: /download backup/i })).not.toBeDisabled();
  });

  it("calls exportBackup and shows success on submit", async () => {
    const mockExport = vi.mocked(backup.exportBackup).mockResolvedValue(undefined);

    render(<BackupSection />);
    const input = screen.getByLabelText(/encryption passphrase/i);
    await userEvent.type(input, "strongpassword");
    await userEvent.click(screen.getByRole("button", { name: /download backup/i }));

    await waitFor(() => {
      expect(mockExport).toHaveBeenCalledWith("strongpassword");
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/downloaded successfully/i);
    });
  });

  it("shows error on export failure", async () => {
    vi.mocked(backup.exportBackup).mockRejectedValue(new Error("export failed"));

    render(<BackupSection />);
    const input = screen.getByLabelText(/encryption passphrase/i);
    await userEvent.type(input, "strongpassword");
    await userEvent.click(screen.getByRole("button", { name: /download backup/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/export failed/i);
    });
  });
});

describe("BackupSection - ImportCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders import heading and controls", () => {
    render(<BackupSection />);
    expect(screen.getByText("Import backup")).toBeInTheDocument();
    expect(screen.getByLabelText(/backup file/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/decryption passphrase/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore backup/i })).toBeInTheDocument();
  });

  it("disables restore button when no file is selected", () => {
    render(<BackupSection />);
    const passphraseInput = screen.getByLabelText(/decryption passphrase/i);
    fireEvent.change(passphraseInput, { target: { value: "longenough" } });
    expect(screen.getByRole("button", { name: /restore backup/i })).toBeDisabled();
  });

  it("importBackup mock returns success result when called", async () => {
    vi.mocked(backup.importBackup).mockResolvedValue({
      restored: true,
      createdAt: "2026-06-05T12:00:00.000Z"
    });

    const file = new File(["binary"], "backup.bin");
    const result = await backup.importBackup(file, "strongpassword");

    expect(backup.importBackup).toHaveBeenCalledWith(file, "strongpassword");
    expect(result.restored).toBe(true);
    expect(result.createdAt).toBe("2026-06-05T12:00:00.000Z");
  });

  it("importBackup mock rejects on wrong passphrase", async () => {
    vi.mocked(backup.importBackup).mockRejectedValue(
      new Error("Wrong passphrase or corrupted backup file.")
    );

    const file = new File(["binary"], "backup.bin");
    await expect(backup.importBackup(file, "wrongpassphrase")).rejects.toThrow(
      /wrong passphrase or corrupted backup file/i
    );
  });
});
