/**
 * Backup router — export and import encrypted backup bundles.
 * POST /api/backup/export  — JSON body { passphrase }
 * POST /api/backup/import  — multipart/form-data { file, passphrase }
 */
import express, { type Request, type Response, type Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Database } from "better-sqlite3";
import { createBackup } from "../../vault/backup.js";
import { restoreBackup, RestoreError } from "../../vault/restore.js";

const limiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const ExportBodySchema = z.object({
  passphrase: z.string().min(8, "passphrase must be at least 8 characters")
});

export interface BackupRouterDeps {
  db: Database;
  dbFilePath?: string;
  vaultFilePath?: string;
  /** Override scrypt N (for tests only — never set in production). */
  scryptN?: number;
}

export function createBackupRouter(deps: BackupRouterDeps): Router {
  const router = express.Router();
  router.use(limiter);

  router.post("/export", express.json({ limit: "1kb" }), async (req: Request, res: Response) => {
    const parsed = ExportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: parsed.error.errors[0]?.message ?? "invalid request" });
      return;
    }
    const { passphrase } = parsed.data;
    try {
      deps.db
        .prepare("INSERT INTO backup_log (direction, created_at) VALUES (?, ?)")
        .run("export", new Date().toISOString());
    } catch {
      /* non-fatal */
    }
    let bundle: Buffer;
    try {
      bundle = await createBackup({
        passphrase,
        dbFilePath: deps.dbFilePath,
        vaultFilePath: deps.vaultFilePath,
        scryptN: deps.scryptN
      });
    } catch {
      res.status(500).json({ error: "backup creation failed" });
      return;
    }
    const dateStr = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="openzigs-social-backup-${dateStr}.bin"`
    );
    res.setHeader("Content-Length", bundle.length);
    res.status(200).end(bundle);
  });

  router.post("/import", (req: Request, res: Response) => {
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) {
      res.status(400).json({ error: "content-type must be multipart/form-data" });
      return;
    }
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      res.status(400).json({ error: "missing multipart boundary" });
      return;
    }
    const boundary = boundaryMatch[1]!;
    let rawBody = Buffer.alloc(0);
    req.on("data", (chunk: Buffer) => {
      rawBody = Buffer.concat([rawBody, chunk]);
    });
    req.on("end", async () => {
      try {
        const { fileBuffer, passphrase } = parseMultipart(rawBody, boundary);
        if (!fileBuffer) {
          res.status(422).json({ error: "missing backup file in request" });
          return;
        }
        if (!passphrase || passphrase.length < 8) {
          res.status(422).json({ error: "passphrase must be at least 8 characters" });
          return;
        }
        try {
          deps.db
            .prepare("INSERT INTO backup_log (direction, created_at) VALUES (?, ?)")
            .run("import", new Date().toISOString());
        } catch {
          /* non-fatal */
        }
        const result = await restoreBackup(fileBuffer, passphrase, {
          dbFilePath: deps.dbFilePath,
          vaultFilePath: deps.vaultFilePath,
          scryptN: deps.scryptN
        });
        res.status(200).json({ restored: true, createdAt: result.createdAt });
      } catch (err) {
        if (err instanceof RestoreError) {
          res.status(422).json({ error: "Wrong passphrase or corrupted backup file." });
        } else {
          res.status(500).json({ error: "restore failed" });
        }
      }
    });
    req.on("error", () => {
      res.status(500).json({ error: "request read failed" });
    });
  });

  return router;
}

/**
 * Parse a multipart/form-data body buffer.
 * Handles binary file fields and text fields.
 */
function parseMultipart(
  body: Buffer,
  boundary: string
): { fileBuffer: Buffer | null; passphrase: string | null } {
  const sepBuf = Buffer.from("--" + boundary, "latin1");
  const CRLF2 = Buffer.from("\r\n\r\n", "latin1");
  const parts = splitBuffer(body, sepBuf);
  let fileBuffer: Buffer | null = null;
  let passphrase: string | null = null;
  for (const part of parts) {
    let content = part;
    // Strip leading \r\n that follows each boundary
    if (content.length >= 2 && content[0] === 0x0d && content[1] === 0x0a) {
      content = content.subarray(2);
    }
    if (content.length < 4) continue;
    // Skip closing boundary "--" marker
    if (content[0] === 0x2d && content[1] === 0x2d) continue;
    const headerEnd = bufferIndexOf(content, CRLF2, 0);
    if (headerEnd === -1) continue;
    const headerStr = content.subarray(0, headerEnd).toString("utf8");
    let bodyContent = content.subarray(headerEnd + 4);
    // Strip trailing \r\n before next boundary
    if (
      bodyContent.length >= 2 &&
      bodyContent[bodyContent.length - 2] === 0x0d &&
      bodyContent[bodyContent.length - 1] === 0x0a
    ) {
      bodyContent = bodyContent.subarray(0, bodyContent.length - 2);
    }
    const nameMatch = headerStr.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    if (fieldName === "file") fileBuffer = Buffer.from(bodyContent);
    else if (fieldName === "passphrase") passphrase = bodyContent.toString("utf8");
  }
  return { fileBuffer, passphrase };
}

function splitBuffer(buf: Buffer, sep: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (start <= buf.length) {
    const idx = bufferIndexOf(buf, sep, start);
    if (idx === -1) {
      parts.push(buf.subarray(start));
      break;
    }
    parts.push(buf.subarray(start, idx));
    start = idx + sep.length;
  }
  return parts;
}

function bufferIndexOf(haystack: Buffer, needle: Buffer, offset: number): number {
  if (needle.length === 0) return offset;
  const limit = haystack.length - needle.length;
  for (let i = offset; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
