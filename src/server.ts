/**
 * openzigs-social server entrypoint.
 *
 * Boots the HTTP + Socket.IO server (Express + helmet, SQLite, sessions,
 * logging, audit, metrics) via {@link startServer} and wires graceful
 * shutdown on SIGINT/SIGTERM. Channel pollers, the Copilot SDK agent runtime,
 * Telegram, and approval flows land in later epics.
 */
import { startServer, type StartedServer } from "./server/index.js";

export async function bootstrap(): Promise<StartedServer> {
  const server = await startServer();

  const shutdown = (): void => {
    server
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
      });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
