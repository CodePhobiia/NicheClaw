import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheCompileCommand } from "../../../src/commands/niche/compile.js";
import { nicheCreateCommand } from "../../../src/commands/niche/create.js";
import { nichePrepareBenchmarkCommand } from "../../../src/commands/niche/prepare-benchmark.js";
import { nichePrepareReleaseCommand } from "../../../src/commands/niche/prepare-release.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { writeBenchmarkResultRecord } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-prep-release-"));
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
    niche_program_id: "prep-release-test",
    name: "Prepare Release Test",
    objective: "Test the prepare-release bridge command.",
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
        target_description: "Better tasks.",
        measurement_method: "benchmark grading",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store",
      training_policy: "train",
      benchmark_policy: "held-out",
      retention_policy: "retain",
      redaction_policy: "redact",
      pii_policy: "none",
      live_trace_reuse_policy: "embargo",
      operator_review_required: false,
    },
  });
  return programPath;
}

function makeSourceFiles(dir: string): string[] {
  const paths: string[] = [];

  const p1 = path.join(dir, "source.json");
  saveJsonFile(p1, {
    sourceId: "doc",
    sourceKind: "repos",
    inputKind: "structured_text",
    title: "Docs",
    text: "Build workflows.",
    accessPattern: "workspace",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "OK.",
  });
  paths.push(p1);

  const p2 = path.join(dir, "seed1.json");
  saveJsonFile(p2, {
    sourceId: "seed-1",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Seed 1",
    prompt: "Fix CI.",
    taskFamilyId: "ci-repair",
    passConditions: ["fixed"],
    hardFailConditions: ["unsafe"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "OK.",
  });
  paths.push(p2);

  const p3 = path.join(dir, "seed2.json");
  saveJsonFile(p3, {
    sourceId: "seed-2",
    sourceKind: "domain_constraints",
    inputKind: "benchmark_seed",
    title: "Seed 2",
    prompt: "Verify output.",
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

describe("niche prepare-release", () => {
  it("generates release artifacts from a benchmark result", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      await nicheCreateCommand({ programPath, json: false });
      await nicheCompileCommand({
        nicheProgramId: "prep-release-test",
        sourcePaths,
        version: "v1",
        compiledAt: "2026-03-14T12:00:00.000Z",
        json: false,
      });

      const prepBench = await nichePrepareBenchmarkCommand({
        nicheProgramId: "prep-release-test",
        json: false,
      });

      // Write a synthetic benchmark result record so prepare-release can find it.
      const baselineId = path.basename(prepBench.baseline_manifest_path, ".json");
      const candidateId = path.basename(prepBench.candidate_manifest_path, ".json");
      const dummyHash = "a".repeat(64);
      writeBenchmarkResultRecord(
        {
          benchmark_result_record_id: "prep-release-test-result-1",
          summary: {
            benchmark_result_id: "prep-release-test-result-1",
            benchmark_suite_id: "prep-release-test-suite",
            case_kind: "atomic_case",
            mode: "offline_gold",
            baseline_arm_id: baselineId,
            candidate_arm_id: candidateId,
            baseline_provider_metadata_quality: "release_label_only",
            candidate_provider_metadata_quality: "release_label_only",
            primary_metric: "task_success",
            case_count: 2,
            paired_delta_summary: {
              mean_delta: 0.15,
              median_delta: 0.12,
              p10_delta: 0.05,
              p90_delta: 0.25,
              confidence_interval_low: 0.02,
              confidence_interval_high: 0.28,
            },
            task_family_summaries: [
              {
                task_family: "ci-repair",
                case_count: 1,
                score_mean: 0.85,
                hard_fail_rate: 0,
                mean_delta: 0.15,
              },
              {
                task_family: "grounding",
                case_count: 1,
                score_mean: 0.9,
                hard_fail_rate: 0,
                mean_delta: 0.15,
              },
            ],
            contamination_audit_summary: {
              contamination_detected: false,
              audited_case_count: 2,
              notes: "Clean.",
            },
            invalidated: false,
            invalidation_reasons: [],
          },
          baseline_manifest_id: baselineId,
          candidate_manifest_id: candidateId,
          suite_hash: dummyHash,
          fixture_version: "v1-fixtures",
          actual_suite_hash: dummyHash,
          actual_fixture_version: "v1-fixtures",
          case_membership_hash: dummyHash,
          run_trace_refs: [],
          replay_bundle_refs: [],
          evidence_bundle_ids: [],
          created_at: "2026-03-14T13:00:00.000Z",
        },
        process.env,
      );

      const result = await nichePrepareReleaseCommand({
        nicheProgramId: "prep-release-test",
        json: false,
      });

      expect(result.baseline_manifest_path).toContain("baseline");
      expect(result.candidate_manifest_path).toContain("candidate");
      expect(result.benchmark_result_path).toBeDefined();
      expect(result.verifier_metrics_path).toBeDefined();
      expect(result.monitor_definition_path).toBeDefined();
      expect(result.component_artifact_refs_path).toBeDefined();

      // Verify the artifacts are valid JSON.
      const verifierMetrics = JSON.parse(await fs.readFile(result.verifier_metrics_path, "utf-8"));
      expect(verifierMetrics.false_veto_rate).toBe(0);
      expect(verifierMetrics.sample_count).toBe(0);

      const monitorDef = JSON.parse(await fs.readFile(result.monitor_definition_path, "utf-8"));
      expect(monitorDef.monitor.baseline_manifest_id).toBe(baselineId);
      expect(monitorDef.monitor.candidate_manifest_id).toBe(candidateId);
      expect(monitorDef.cadence_defaults.shadow_recheck_interval_hours).toBe(24);
    });
  });

  it("fails without a compilation record", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      await nicheCreateCommand({ programPath, json: false });

      await expect(
        nichePrepareReleaseCommand({ nicheProgramId: "prep-release-test", json: false }),
      ).rejects.toThrow("Missing compilation record");
    });
  });
});
