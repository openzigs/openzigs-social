/**
 * openzigs-social server entrypoint.
 *
 * This is a placeholder. Real wiring (Express + Socket.IO + sessions +
 * Copilot SDK + Telegram channel + platform pollers + approval queue) is
 * built across the Foundation epics. See docs/ARCHITECTURE.md.
 */
export async function bootstrap(): Promise<void> {
  // Intentionally empty for the initial scaffold.
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
