# Server sidecar binaries

This directory holds the pre-compiled Node.js server executable that Tauri
bundles into the desktop app.  The file must be named:

```
server-<target-triple>          # macOS / Linux
server-<target-triple>.exe      # Windows
```

e.g. `server-aarch64-apple-darwin` on Apple Silicon.

## Building the sidecar

From the repo root:

```bash
pnpm tauri:sidecar
```

That script:

1. Compiles the TypeScript server (`pnpm build` → `dist/`).
2. Bundles `dist/server.js` + the Node runtime into a single self-contained
   executable via [`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg):

   ```bash
   npx @yao-pkg/pkg dist/server.js \
     --target node22-macos-arm64 \
     --output src-tauri/binaries/server-aarch64-apple-darwin
   ```

   Adjust `--target` for your platform.  See `@yao-pkg/pkg` docs for all
   supported target triples.

3. The resulting binary is placed here and picked up by `tauri build` via the
   `bundle.externalBin` entry in `tauri.conf.json`.

## Git-ignore

Compiled binaries are excluded by `.gitignore` — commit only this README.
