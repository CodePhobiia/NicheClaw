import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nicheVerify } from "../../../src/commands/niche/verify.js";
import { resolveNicheStoreRoots } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../helpers/temp-home.js";

describe("nicheVerify", () => {
  it("reports ok for an empty store", async () => {
    await withTempHome(async () => {
      const result = nicheVerify(process.env);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.scanned_files).toBe(0);
    });
  });

  it("reports ok when all JSON files are valid", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.writeFileSync(
        path.join(roots.programs, "test-prog.json"),
        JSON.stringify({ id: "test-prog" }),
        "utf8",
      );

      const result = nicheVerify(process.env);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.scanned_files).toBeGreaterThanOrEqual(1);
    });
  });

  it("reports parse errors for invalid JSON files", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.writeFileSync(path.join(roots.programs, "bad.json"), "this is not json{{{", "utf8");

      const result = nicheVerify(process.env);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].kind).toBe("parse_error");
      expect(result.errors[0].file).toContain("bad.json");
    });
  });

  it("warns about orphan .tmp files", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.writeFileSync(
        path.join(roots.programs, "stale.json.tmp"),
        JSON.stringify({ leftover: true }),
        "utf8",
      );

      const result = nicheVerify(process.env);
      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].kind).toBe("orphan_tmp");
    });
  });

  it("warns about orphan .lock files", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.releases, { recursive: true });
      fs.writeFileSync(path.join(roots.releases, "state.lock"), "12345", "utf8");

      const result = nicheVerify(process.env);
      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].kind).toBe("orphan_lock");
    });
  });

  it("reports multiple issues in a single scan", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.mkdirSync(roots.releases, { recursive: true });

      // Valid file
      fs.writeFileSync(
        path.join(roots.programs, "good.json"),
        JSON.stringify({ ok: true }),
        "utf8",
      );
      // Invalid JSON
      fs.writeFileSync(path.join(roots.programs, "corrupt.json"), "{broken", "utf8");
      // Orphan tmp
      fs.writeFileSync(path.join(roots.programs, "data.json.tmp"), "{}", "utf8");
      // Orphan lock
      fs.writeFileSync(path.join(roots.releases, "state.lock"), "999", "utf8");

      const result = nicheVerify(process.env);
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.warnings).toHaveLength(2);
      expect(result.scanned_files).toBeGreaterThanOrEqual(4);
    });
  });

  it("scans nested directories", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      const nested = path.join(roots.manifests, "baseline", "v1");
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, "manifest.json"), JSON.stringify({ id: "m1" }), "utf8");

      const result = nicheVerify(process.env);
      expect(result.ok).toBe(true);
      expect(result.scanned_files).toBeGreaterThanOrEqual(1);
    });
  });
});
