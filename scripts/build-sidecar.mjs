/**
 * build-sidecar.mjs — compile the Node.js server into a self-contained
 * executable for the Tauri desktop bundle (epic #108, issue #110).
 *
 * Uses @yao-pkg/pkg to produce a single binary that includes the compiled
 * server (dist/server.js) and a bundled Node.js 22 runtime. The output is
 * named according to Tauri's `<name>-<target-triple>` sidecar convention.
 *
 * Usage (called by `pnpm tauri:sidecar`):
 *
 *   node scripts/build-sidecar.mjs
 *
 * The target triple is auto-detected from `process.platform` + `process.arch`
 * but can be overridden via the TARGET_TRIPLE env var.
 *
 * Supported triples:
 *   aarch64-apple-darwin     (macOS Apple Silicon)
 *   x86_64-apple-darwin      (macOS Intel)
 *   x86_64-pc-windows-msvc   (Windows 64-bit)
 *   x86_64-unknown-linux-gnu (Linux 64-bit)
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_SERVER = join(ROOT, "dist", "server.js");
const BIN_DIR = join(ROOT, "src-tauri", "binaries");

/** Map Node.js platform/arch strings to Tauri target triples. */
const TRIPLE_MAP = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
};

const platformKey = `${process.platform}-${process.arch}`;
const triple = process.env.TARGET_TRIPLE ?? TRIPLE_MAP[platformKey];

if (!triple) {
  console.error(
    `[build-sidecar] Unsupported platform: ${platformKey}.\n` +
    `Set TARGET_TRIPLE env var to override (e.g. x86_64-apple-darwin).`
  );
  process.exit(1);
}

const isWindows = triple.includes("windows");
const outBinary = join(BIN_DIR, isWindows ? `server-${triple}.exe` : `server-${triple}`);

if (!existsSync(DIST_SERVER)) {
  console.error(
    `[build-sidecar] dist/server.js not found.\n` +
    `Run "pnpm build" first to compile the TypeScript server.`
  );
  process.exit(1);
}

console.log(`[build-sidecar] Building sidecar for ${triple}...`);
console.log(`  input:  ${DIST_SERVER}`);
console.log(`  output: ${outBinary}`);

// @yao-pkg/pkg bundles the ESM/CJS entry + a Node runtime into a single
// self-contained executable that does not require Node installed on the host.
execFileSync(
  "npx",
  [
    "@yao-pkg/pkg",
    DIST_SERVER,
    "--target", `node22-${nodeOsFromTriple(triple)}-${nodeArchFromTriple(triple)}`,
    "--output", outBinary,
    "--compress", "GZip",
  ],
  { stdio: "inherit", cwd: ROOT }
);

console.log(`[build-sidecar] Done → ${outBinary}`);

// ---------------------------------------------------------------------------

function nodeOsFromTriple(t) {
  if (t.includes("apple-darwin")) return "macos";
  if (t.includes("windows")) return "win";
  return "linux";
}

function nodeArchFromTriple(t) {
  if (t.startsWith("aarch64")) return "arm64";
  return "x64";
}
