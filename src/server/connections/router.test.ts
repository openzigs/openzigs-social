import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";

import express, { type Express } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CredentialVault } from "../../vault/index.js";
import { createConnectionsRouter } from "./router.js";

function makeVault(): CredentialVault {
  const dir = mkdtempSync(join(tmpdir(), "ozs-conn-"));
  return new CredentialVault({ filePath: join(dir, "auth.json"), keyMaterial: "test-key" });
}

function listen(app: Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe("connections router", () => {
  let server: Server;
  let base: string;
  let vault: CredentialVault;

  async function mount(): Promise<void> {
    const app = express();
    app.use(express.json());
    app.use("/api/connections", createConnectionsRouter({ vault }));
    ({ server, base } = await listen(app));
  }

  beforeEach(() => {
    vault = makeVault();
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("lists all Meta platforms as disconnected by default", async () => {
    await mount();
    const res = await fetch(`${base}/api/connections`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connections: Array<{ platform: string; connected: boolean; label: string }>;
    };
    expect(body.connections.map((c) => c.platform)).toEqual(["instagram", "facebook", "threads"]);
    expect(body.connections.every((c) => c.connected === false)).toBe(true);
    expect(body.connections.find((c) => c.platform === "facebook")?.label).toBe("Facebook Pages");
  });

  it("marks a platform connected once an OAuth token is stored", async () => {
    await vault.setOAuth("instagram", { accessToken: "tok", expiresAt: 999 });
    await mount();
    const res = await fetch(`${base}/api/connections`);
    const body = (await res.json()) as {
      connections: Array<{ platform: string; connected: boolean; expiresAt?: number }>;
    };
    const ig = body.connections.find((c) => c.platform === "instagram");
    expect(ig?.connected).toBe(true);
    expect(ig?.expiresAt).toBe(999);
  });

  it("reports needsReconsent and not connected when a refresh has failed", async () => {
    await vault.setOAuth("threads", { accessToken: "tok", needsReconsent: true });
    await mount();
    const res = await fetch(`${base}/api/connections`);
    const body = (await res.json()) as {
      connections: Array<{ platform: string; connected: boolean; needsReconsent: boolean }>;
    };
    const threads = body.connections.find((c) => c.platform === "threads");
    expect(threads?.connected).toBe(false);
    expect(threads?.needsReconsent).toBe(true);
  });

  it("never echoes token material", async () => {
    await vault.setOAuth("facebook", { accessToken: "super-secret-token" });
    await mount();
    const res = await fetch(`${base}/api/connections`);
    const text = await res.text();
    expect(text).not.toContain("super-secret-token");
    expect(text).not.toContain("accessToken");
  });
});
