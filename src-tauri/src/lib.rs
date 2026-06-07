//! openzigs social — Tauri v2 desktop shell (#108, #109, #110).
//!
//! ## Architecture (ADR 0001)
//!
//! The Tauri window is a thin shell that:
//!   1. Resolves the data directory (`~/Library/Application Support/social.openzigs.app`
//!      on macOS, `%APPDATA%\social.openzigs.app` on Windows) via Tauri's path API
//!      and exports it as `OPENZIGS_SOCIAL_HOME` so the Node server derives all
//!      persistence paths from the correct sandbox-legal location.
//!   2. Spawns the pre-compiled Node server binary (`binaries/server-<target-triple>`)
//!      as a managed sidecar.  In debug builds the sidecar spawn is skipped —
//!      developers run `pnpm dev` in a separate terminal and Tauri points the
//!      WebView at `http://localhost:3001` (see `beforeDevCommand` in tauri.conf.json).
//!   3. Kills the sidecar cleanly when the last window is destroyed.
//!
//! ## Building the server sidecar binary
//!
//! Run `pnpm tauri:sidecar` from the repo root.  That script:
//!   1. Compiles the TypeScript server (`pnpm build` → `dist/`).
//!   2. Bundles it into a standalone Node executable via `@yao-pkg/pkg` and renames
//!      the output to match Tauri's `<name>-<target-triple>` convention.
//!
//! The resulting binary is placed at `src-tauri/binaries/server-<target-triple>`
//! and is git-ignored (`binaries/*.{exe,dmg,msi,app}` excluded by .gitignore).

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

/// Holds the server sidecar child process so we can kill it on exit.
pub struct ServerProcess(pub Mutex<Option<CommandChild>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // In debug builds the developer runs the server via `pnpm dev`; the
            // sidecar binary may not exist yet, so we skip the spawn.
            #[cfg(not(debug_assertions))]
            spawn_server_sidecar(app.handle())?;

            // Always register the state so the on_window_event handler compiles.
            app.manage(ServerProcess(Mutex::new(None)));

            Ok(())
        })
        .on_window_event(|window, event| {
            // When the last window closes, stop the sidecar so it doesn't become
            // an orphaned background process.
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<ServerProcess>();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        // Best-effort kill — we don't propagate errors here since
                        // we're already shutting down.
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running openzigs social");
}

/// Resolve the data directory and spawn the server sidecar.
///
/// Data dir resolution (per ADR 0001):
///   - macOS:   `~/Library/Application Support/social.openzigs.app/`
///   - Windows: `%APPDATA%\social.openzigs.app\`
///
/// The resolved path is exported as `OPENZIGS_SOCIAL_HOME` so the Node server
/// derives the vault, SQLite, session, log, and audit paths from it.
#[cfg(not(debug_assertions))]
fn spawn_server_sidecar(handle: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = handle.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;

    let data_dir_str = data_dir
        .to_str()
        .ok_or("data dir path contains invalid UTF-8")?;

    let (_, child) = handle
        .shell()
        .sidecar("server")?
        .env("OPENZIGS_SOCIAL_HOME", data_dir_str)
        .env("NODE_ENV", "production")
        .spawn()?;

    // Store the child so the window-destroyed handler can kill it.
    handle
        .state::<ServerProcess>()
        .0
        .lock()
        .expect("server process mutex poisoned")
        .replace(child);

    Ok(())
}
