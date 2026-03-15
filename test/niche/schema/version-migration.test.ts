import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NICHE_SCHEMA_VERSION } from "../../../src/niche/schema/common.js";
import {
  validateSchemaVersion,
  writeSchemaVersion,
} from "../../../src/niche/store/schema-version.js";

describe("NicheClaw schema version tracking", () => {
  let tmpDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "niche-schema-ver-"));
    const stateDir = path.join(tmpDir, "niche");
    fs.mkdirSync(stateDir, { recursive: true });
    env = { OPENCLAW_STATE_DIR: tmpDir };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns ok with no stored version for a new store", () => {
    const result = validateSchemaVersion(env);
    expect(result.ok).toBe(true);
    expect(result.stored).toBeUndefined();
    expect(result.current).toBe(NICHE_SCHEMA_VERSION);
    expect(result.message).toContain("No stored version");
  });

  it("writes and validates matching version", () => {
    writeSchemaVersion(env);
    const result = validateSchemaVersion(env);
    expect(result.ok).toBe(true);
    expect(result.stored).toBe(NICHE_SCHEMA_VERSION);
    expect(result.current).toBe(NICHE_SCHEMA_VERSION);
  });

  it("detects major version mismatch", () => {
    const stateDir = path.join(tmpDir, "niche");
    fs.writeFileSync(
      path.join(stateDir, ".schema-version"),
      JSON.stringify({ version: "2.0.0", written_at: new Date().toISOString() }),
    );
    const result = validateSchemaVersion(env);
    expect(result.ok).toBe(false);
    expect(result.stored).toBe("2.0.0");
    expect(result.message).toContain("Major version mismatch");
  });

  it("allows minor version difference", () => {
    const stateDir = path.join(tmpDir, "niche");
    fs.writeFileSync(
      path.join(stateDir, ".schema-version"),
      JSON.stringify({ version: "1.1.0", written_at: new Date().toISOString() }),
    );
    const result = validateSchemaVersion(env);
    expect(result.ok).toBe(true);
    expect(result.stored).toBe("1.1.0");
    expect(result.message).toContain("Minor version difference");
  });

  it("handles corrupt version file gracefully", () => {
    const stateDir = path.join(tmpDir, "niche");
    fs.writeFileSync(path.join(stateDir, ".schema-version"), "not json");
    const result = validateSchemaVersion(env);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("Could not read stored version");
  });

  it("skips write when state root does not exist", () => {
    const missingEnv = { OPENCLAW_STATE_DIR: path.join(tmpDir, "nonexistent") };
    writeSchemaVersion(missingEnv);
    // Should not throw; just skip silently
    const nicheDir = path.join(tmpDir, "nonexistent", "niche");
    expect(fs.existsSync(path.join(nicheDir, ".schema-version"))).toBe(false);
  });

  it("exports NICHE_SCHEMA_VERSION as semver string", () => {
    expect(NICHE_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
