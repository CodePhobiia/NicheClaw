import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheCompileCommand } from "../../../src/commands/niche/compile.js";
import { nicheCreateCommand } from "../../../src/commands/niche/create.js";
import { nichePrepareBenchmarkCommand } from "../../../src/commands/niche/prepare-benchmark.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { getAtomicBenchmarkSuite } from "../../../src/niche/benchmark/suite-registry.js";
import { getBaselineManifest, getCandidateManifest } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-prep-bench-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeRights() {
  return {
    rights_to_store: true,
    rights_to_train: true,
    rights_to_benchmark: true,
    rights_to_derive: true,
    rights_to_distill: true,
    rights_to_generate_synthetic_from: true,
    retention_policy: "retain",
    redaction_status: "clean",
    pii_status: "none",
    provenance_status: "verified",
    data_zone: "dev",
  };
}

function makeProgramFile(dir: string): string {
  const programPath = path.join(dir, "niche-program.json");
  saveJsonFile(programPath, {
    niche_program_id: "prep-bench-test",
    name: "Prepare Benchmark Test",
    objective: "Test the prepare-benchmark bridge command.",
    risk_class: "low",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "anthropic",
        model_id: "claude-sonnet-4-5-20250514",
        api_mode: "messages",
      },
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read", "exec"],
    allowed_sources: [{ source_id: "repo-root", source_kind: "repos" }],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success",
        objective: "maximize",
        target_description: "Better task completion.",
        measurement_method: "benchmark grading",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store approved",
      training_policy: "train on approved",
      benchmark_policy: "held-out evals",
      retention_policy: "retain per governance",
      redaction_policy: "redact first",
      pii_policy: "no unreviewed PII",
      live_trace_reuse_policy: "embargo first",
      operator_review_required: false,
    },
  });
  return programPath;
}

function makeSourceFiles(dir: string): string[] {
  const paths: string[] = [];

  const p1 = path.join(dir, "source-structured.json");
  saveJsonFile(p1, {
    sourceId: "doc-source",
    sourceKind: "repos",
    inputKind: "structured_text",
    title: "Repo docs",
    text: "Build verification and CI repair workflows.",
    accessPattern: "workspace",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "Verified.",
  });
  paths.push(p1);

  const p2 = path.join(dir, "source-seed-1.json");
  saveJsonFile(p2, {
    sourceId: "seed-1",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Seed 1",
    prompt: "Fix the CI build.",
    taskFamilyId: "ci-repair",
    passConditions: ["fixed"],
    hardFailConditions: ["unsafe"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "OK.",
  });
  paths.push(p2);

  const p3 = path.join(dir, "source-seed-2.json");
  saveJsonFile(p3, {
    sourceId: "seed-2",
    sourceKind: "domain_constraints",
    inputKind: "benchmark_seed",
    title: "Seed 2",
    prompt: "Verify grounding.",
    taskFamilyId: "grounding",
    passConditions: ["grounded"],
    hardFailConditions: ["hallucinated"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "OK.",
  });
  paths.push(p3);

  return paths;
}

describe("niche prepare-benchmark", () => {
  it("generates manifests and benchmark suite from a compilation record", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      await nicheCreateCommand({ programPath, json: false });
      await nicheCompileCommand({
        nicheProgramId: "prep-bench-test",
        sourcePaths,
        version: "v1",
        compiledAt: "2026-03-14T12:00:00.000Z",
        json: false,
      });

      const result = await nichePrepareBenchmarkCommand({
        nicheProgramId: "prep-bench-test",
        json: false,
      });

      // Manifests were stored
      expect(result.baseline_manifest_path).toBeDefined();
      expect(result.candidate_manifest_path).toBeDefined();
      expect(result.benchmark_suite_path).toBeDefined();

      const baselineId = path.basename(result.baseline_manifest_path, ".json");
      const candidateId = path.basename(result.candidate_manifest_path, ".json");
      const baseline = getBaselineManifest(baselineId, process.env);
      const candidate = getCandidateManifest(candidateId, process.env);

      expect(baseline).not.toBeNull();
      expect(candidate).not.toBeNull();
      expect(candidate!.based_on_baseline_manifest_id).toBe(baseline!.baseline_manifest_id);

      // Suite was stored with eval cases from seed hints
      const suite = getAtomicBenchmarkSuite("prep-bench-test-suite", process.env);
      expect(suite).not.toBeNull();
      expect(suite!.cases.length).toBeGreaterThanOrEqual(2);
      expect(suite!.metadata.task_families).toContain("ci-repair");
      expect(suite!.metadata.task_families).toContain("grounding");
    });
  });

  it("is idempotent when run twice", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      await nicheCreateCommand({ programPath, json: false });
      await nicheCompileCommand({
        nicheProgramId: "prep-bench-test",
        sourcePaths,
        version: "v1",
        compiledAt: "2026-03-14T12:00:00.000Z",
        json: false,
      });

      const first = await nichePrepareBenchmarkCommand({
        nicheProgramId: "prep-bench-test",
        json: false,
      });
      const second = await nichePrepareBenchmarkCommand({
        nicheProgramId: "prep-bench-test",
        json: false,
      });

      expect(second.baseline_manifest_path).toBe(first.baseline_manifest_path);
      expect(second.candidate_manifest_path).toBe(first.candidate_manifest_path);
      expect(second.benchmark_suite_path).toBe(first.benchmark_suite_path);
    });
  });

  it("emits release artifacts when requested", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      await nicheCreateCommand({ programPath, json: false });
      await nicheCompileCommand({
        nicheProgramId: "prep-bench-test",
        sourcePaths,
        version: "v1",
        compiledAt: "2026-03-14T12:00:00.000Z",
        json: false,
      });

      const result = await nichePrepareBenchmarkCommand({
        nicheProgramId: "prep-bench-test",
        emitReleaseArtifacts: true,
        json: false,
      });

      expect(result.verifier_metrics_path).toBeDefined();
      expect(result.monitor_definition_path).toBeDefined();
      expect(result.component_artifact_refs_path).toBeDefined();
    });
  });

  it("fails without a compilation record", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      await nicheCreateCommand({ programPath, json: false });

      await expect(
        nichePrepareBenchmarkCommand({ nicheProgramId: "prep-bench-test", json: false }),
      ).rejects.toThrow("Missing compilation record");
    });
  });
});
