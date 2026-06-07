# App Icons

Generate all required icon sizes from the source SVG:

```bash
# From the repo root — requires @tauri-apps/cli on PATH (or npx)
npx @tauri-apps/cli icon docs/app-icon.png
```

This creates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS), and
`icon.ico` (Windows) in this directory.

The source image (`docs/app-icon.png`) should be at least 1024×1024 px with a
transparent background.  Until a real brand icon exists, any placeholder PNG of
that size will produce buildable (if ugly) icons.
