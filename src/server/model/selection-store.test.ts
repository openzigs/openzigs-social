import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ModelSelectionStore } from "./selection-store.js";

describe("ModelSelectionStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ozs-model-"));
    filePath = join(dir, "model.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns undefined when no selection has been persisted", async () => {
    const store = new ModelSelectionStore({ filePath });
    expect(await store.get()).toBeUndefined();
  });

  it("persists and reads back a local selection", async () => {
    const store = new ModelSelectionStore({ filePath });
    const saved = await store.set({ provider: "local", model: "gemma4:e4b" });
    expect(saved).toEqual({ provider: "local", model: "gemma4:e4b" });
    expect(await store.get()).toEqual({ provider: "local", model: "gemma4:e4b" });
  });

  it("trims the model and drops empty/whitespace model fields", async () => {
    const store = new ModelSelectionStore({ filePath });
    expect(await store.set({ provider: "openai", model: "   " })).toEqual({ provider: "openai" });
    expect(await store.set({ provider: "local", model: "  gemma4:12b  " })).toEqual({
      provider: "local",
      model: "gemma4:12b"
    });
  });

  it("rejects an invalid provider", async () => {
    const store = new ModelSelectionStore({ filePath });
    await expect(store.set({ provider: "bogus" as unknown as "local" })).rejects.toThrow(
      /invalid model provider/
    );
  });

  it("returns undefined for a corrupt file", async () => {
    await writeFile(filePath, "not json", "utf8");
    const store = new ModelSelectionStore({ filePath });
    expect(await store.get()).toBeUndefined();
  });

  it("returns undefined when the persisted provider is unknown", async () => {
    await writeFile(filePath, JSON.stringify({ provider: "weird" }), "utf8");
    const store = new ModelSelectionStore({ filePath });
    expect(await store.get()).toBeUndefined();
  });

  it("exposes the resolved file path", () => {
    const store = new ModelSelectionStore({ filePath });
    expect(store.path).toBe(filePath);
  });

  it("falls back to the default data-dir path", () => {
    const store = new ModelSelectionStore();
    expect(store.path).toMatch(/model\.json$/);
  });
});
