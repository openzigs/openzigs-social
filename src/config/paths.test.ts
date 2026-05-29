import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
  auditDir,
  DATA_DIR_ENV,
  dbPath,
  defaultDataDir,
  logsDir,
  resolveDataDir,
  sessionsDir,
  userConfigPath,
  vaultPath
} from "./paths.js";

describe("paths", () => {
  const original = process.env[DATA_DIR_ENV];

  beforeEach(() => {
    delete process.env[DATA_DIR_ENV];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[DATA_DIR_ENV];
    else process.env[DATA_DIR_ENV] = original;
  });

  it("defaults to ~/.openzigs-social", () => {
    expect(defaultDataDir()).toBe(join(homedir(), ".openzigs-social"));
    expect(resolveDataDir()).toBe(join(homedir(), ".openzigs-social"));
  });

  it("honours the OPENZIGS_SOCIAL_HOME override", () => {
    const dir = join(tmpdir(), "ozs-test-home");
    process.env[DATA_DIR_ENV] = dir;
    expect(resolveDataDir()).toBe(dir);
  });

  it("ignores a blank override", () => {
    process.env[DATA_DIR_ENV] = "   ";
    expect(resolveDataDir()).toBe(defaultDataDir());
  });

  it("derives every subpath from the root", () => {
    const dir = join(tmpdir(), "ozs-test-subpaths");
    process.env[DATA_DIR_ENV] = dir;
    expect(logsDir()).toBe(join(dir, "logs"));
    expect(auditDir()).toBe(join(dir, "audit"));
    expect(sessionsDir()).toBe(join(dir, "sessions"));
    expect(dbPath()).toBe(join(dir, "openzigs-social.db"));
    expect(vaultPath()).toBe(join(dir, "auth.json"));
    expect(userConfigPath()).toBe(join(dir, "user.json"));
  });
});
