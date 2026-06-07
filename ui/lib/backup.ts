/**
 * API client functions for the backup/restore endpoints.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * Export an encrypted backup bundle and trigger a file download in the browser.
 *
 * @returns The backup's creation date from the bundle, or null if export fails.
 */
export async function exportBackup(passphrase: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/backup/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase })
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `export failed (${res.status})`);
  }

  // Trigger browser download
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().split("T")[0];
  const a = document.createElement("a");
  a.href = url;
  a.download = `openzigs-social-backup-${dateStr}.bin`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  restored: boolean;
  createdAt: string;
}

/**
 * Import an encrypted backup bundle.
 *
 * @throws {Error} with message "Wrong passphrase or corrupted backup file." on 422.
 */
export async function importBackup(file: File, passphrase: string): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("passphrase", passphrase);

  const res = await fetch(`${API_BASE}/api/backup/import`, {
    method: "POST",
    body: formData
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    restored?: boolean;
    createdAt?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `import failed (${res.status})`);
  }

  return { restored: body.restored ?? false, createdAt: body.createdAt ?? "" };
}
