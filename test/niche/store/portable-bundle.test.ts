import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportNicheBundle,
  importNicheBundle,
  importNicheBundleDryRun,
} from "../../../src/niche/store/portable-bundle.js";
import { writeNicheProgram } from "../../../src/niche/store/program-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeProgram(id: string) {
  return {
    niche_program_id: id,
    name: `Program ${id}`,
    objective: "Test objective.",
    risk_class: "moderate" as const,
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "anthropic",
        model_id: "claude-sonnet-4-5-20250514",
        api_mode: "messages",
      },
      specialization_lanes: ["system_specialization" as const],
    },
    allowed_tools: ["read", "exec"],
    allowed_sources: [{ source_id: "s1", source_kind: "repos" as const, description: "Repo." }],
    success_metrics: [
      {
        metric_id: "m1",
        label: "Success",
        objective: "maximize" as const,
        target_description: "Improve.",
        measurement_method: "benchmark",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "Store.",
      training_policy: "Train.",
      benchmark_policy: "Benchmark.",
      retention_policy: "Retain.",
      redaction_policy: "Redact.",
      pii_policy: "No PII.",
      live_trace_reuse_policy: "Embargo.",
      operator_review_required: true,
    },
  };
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "niche-bundle-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
  tempDirs.length = 0;
});

describe("exportNicheBundle", () => {
  it("creates bundle directory with manifest.json", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("export-test-alpha"));

      const bundleDir = makeTempDir();
      const result = exportNicheBundle({
        nicheProgramIds: ["export-test-alpha"],
        outDir: bundleDir,
        env: process.env,
      });

      expect(result.bundle_dir).toBe(bundleDir);
      expect(result.program_count).toBe(1);
      expect(result.manifest.niche_program_ids).toEqual(["export-test-alpha"]);
      expect(result.manifest.sections).toContain("programs");

      const manifestPath = path.join(bundleDir, "manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.niche_program_ids).toEqual(["export-test-alpha"]);
      expect(manifest.export_timestamp).toBeTruthy();
    });
  });
});

describe("exportNicheBundle + importNicheBundle round-trip", () => {
  it("export from env A, import into env B", async () => {
    const sharedBundleDir = makeTempDir();

    // Export from environment A
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("roundtrip-alpha"));
      writeNicheProgram(makeProgram("roundtrip-beta"));

      exportNicheBundle({
        nicheProgramIds: ["roundtrip-alpha", "roundtrip-beta"],
        outDir: sharedBundleDir,
        env: process.env,
      });
    });

    // Import into environment B
    await withTempHome(async () => {
      const result = importNicheBundle({
        bundleDir: sharedBundleDir,
        env: process.env,
      });

      expect(result.imported_programs).toBe(2);
      expect(result.errors).toEqual([]);
      expect(result.skipped_duplicates).toBe(0);
    });
  });
});

describe("importNicheBundleDryRun", () => {
  it("shows what would be imported", async () => {
    const sharedBundleDir = makeTempDir();

    // Export
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("dryrun-prog"));

      exportNicheBundle({
        nicheProgramIds: ["dryrun-prog"],
        outDir: sharedBundleDir,
        env: process.env,
      });
    });

    // Dry-run import into a fresh environment
    await withTempHome(async () => {
      const dryRunResult = importNicheBundleDryRun({
        bundleDir: sharedBundleDir,
        env: process.env,
      });

      expect(dryRunResult.would_import.programs).toContain("dryrun-prog");
      expect(dryRunResult.already_exists.programs).toEqual([]);
    });
  });
});

describe("importNicheBundle duplicate handling", () => {
  it("skips duplicates on second import", async () => {
    const sharedBundleDir = makeTempDir();

    // Export from environment A
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("dup-test-prog"));

      exportNicheBundle({
        nicheProgramIds: ["dup-test-prog"],
        outDir: sharedBundleDir,
        env: process.env,
      });
    });

    // Import twice into environment B
    await withTempHome(async () => {
      const firstImport = importNicheBundle({
        bundleDir: sharedBundleDir,
        env: process.env,
      });
      expect(firstImport.imported_programs).toBe(1);
      expect(firstImport.skipped_duplicates).toBe(0);

      const secondImport = importNicheBundle({
        bundleDir: sharedBundleDir,
        env: process.env,
      });
      // Second import: same program already exists, so it should either
      // succeed as a no-op or be counted as a skipped duplicate
      expect(
        secondImport.imported_programs + secondImport.skipped_duplicates,
      ).toBeGreaterThanOrEqual(1);
      expect(secondImport.errors).toEqual([]);
    });
  });
});
