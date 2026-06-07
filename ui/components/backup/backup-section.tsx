"use client";

import { useState, useRef } from "react";
import { exportBackup, importBackup } from "@/lib/backup";

function ExportCard() {
  const [passphrase, setPassphrase] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await exportBackup(passphrase);
      setStatus("success");
      setPassphrase("");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Export failed.");
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Export backup</h3>
        <p className="text-sm text-gray-500 mt-1">
          Download an encrypted backup of your database and credentials. Store it securely — it can
          restore your entire openzigs-social instance.
        </p>
      </div>
      <form onSubmit={handleExport} className="space-y-3">
        <div>
          <label
            htmlFor="export-passphrase"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Encryption passphrase
          </label>
          <input
            id="export-passphrase"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="At least 8 characters"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            You will need this passphrase to restore the backup. It is not stored anywhere.
          </p>
        </div>
        <button
          type="submit"
          disabled={status === "loading" || passphrase.length < 8}
          className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Preparing download…" : "Download backup"}
        </button>
        {status === "success" && (
          <p role="status" className="text-sm text-green-600">
            Backup downloaded successfully.
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="text-sm text-red-600">
            {errorMsg}
          </p>
        )}
      </form>
    </div>
  );
}

function ImportCard() {
  const [passphrase, setPassphrase] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [restoredAt, setRestoredAt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await importBackup(file, passphrase);
      setStatus("success");
      setRestoredAt(result.createdAt);
      setPassphrase("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Restore failed.";
      setErrorMsg(
        msg.includes("passphrase") || msg.includes("corrupted") || msg.includes("Wrong")
          ? "Wrong passphrase or corrupted backup file."
          : msg
      );
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Import backup</h3>
        <p className="text-sm text-gray-500 mt-1">
          Restore a previously exported <code>.bin</code> backup. This overwrites the current
          database and credentials.
        </p>
      </div>
      <form onSubmit={handleImport} className="space-y-3">
        <div>
          <label htmlFor="import-file" className="block text-sm font-medium text-gray-700 mb-1">
            Backup file (.bin)
          </label>
          <input
            id="import-file"
            ref={fileInputRef}
            type="file"
            accept=".bin"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
          />
        </div>
        <div>
          <label
            htmlFor="import-passphrase"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Decryption passphrase
          </label>
          <input
            id="import-passphrase"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="At least 8 characters"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={status === "loading" || !file || passphrase.length < 8}
          className="inline-flex items-center rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "loading" ? "Restoring…" : "Restore backup"}
        </button>
        {status === "success" && (
          <p role="status" className="text-sm text-green-600">
            Backup restored successfully. Created:{" "}
            <time dateTime={restoredAt}>
              {restoredAt ? new Date(restoredAt).toLocaleString() : "unknown"}
            </time>
          </p>
        )}
        {status === "error" && (
          <p role="alert" className="text-sm text-red-600">
            {errorMsg}
          </p>
        )}
      </form>
    </div>
  );
}

export function BackupSection() {
  return (
    <section aria-labelledby="backup-heading" className="space-y-4">
      <h2 id="backup-heading" className="text-lg font-semibold text-gray-900">
        Backup &amp; Restore
      </h2>
      <ExportCard />
      <ImportCard />
    </section>
  );
}
