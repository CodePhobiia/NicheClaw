import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheCompileCommand } from "../../../src/commands/niche/compile.js";
import { nicheCreateCommand } from "../../../src/commands/niche/create.js";
import { nichePrepareBenchmarkCommand } from "../../../src/commands/niche/prepare-benchmark.js";
import { nichePrepareReleaseCommand } from "../../../src/commands/niche/prepare-release.js";
import { nicheReadinessCommand } from "../../../src/commands/niche/readiness.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { getAtomicBenchmarkSuite } from "../../../src/niche/benchmark/suite-registry.js";
import { writeBenchmarkResultRecord } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-pilot-"));
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

/**
 * Creates a NicheProgram that covers enough surface to pass readiness.
 */
function makeProgramFile(dir: string): string {
  const programPath = path.join(dir, "niche-program.json");
  saveJsonFile(programPath, {
    niche_program_id: "repo-ci-pilot",
    name: "Repo CI Pilot",
    objective: "Specialize an agent for repository navigation, CI repair, and verification.",
    risk_class: "moderate",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "anthropic",
        model_id: "claude-sonnet-4-5-20250514",
        api_mode: "messages",
      },
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read", "exec", "apply_patch"],
    allowed_sources: [
      { source_id: "repo-root", source_kind: "repos", description: "Primary repository." },
      { source_id: "ci-logs", source_kind: "logs", description: "CI build logs." },
    ],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success rate",
        objective: "maximize",
        target_description: "Improve held-out task completion on repo/CI tasks.",
        measurement_method: "benchmark grading against gold eval set",
      },
      {
        metric_id: "tool-correctness",
        label: "Tool argument correctness",
        objective: "maximize",
        target_description: "Reduce malformed tool calls.",
        measurement_method: "action policy validation rate",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "Store approved sources for compilation and benchmarking.",
      training_policy: "Train only on approved sources in train/dev zones.",
      benchmark_policy: "Keep gold_eval held out from training.",
      retention_policy: "Retain per governance policy.",
      redaction_policy: "Redact sensitive material before ingestion.",
      pii_policy: "Avoid unreviewed PII.",
      live_trace_reuse_policy: "Embargo live traces for one evaluation cycle.",
      operator_review_required: true,
    },
  });
  return programPath;
}

/**
 * Creates source descriptors covering 3+ source kinds to pass
 * source_coverage threshold (30% = 3/10 kinds).
 */
function makeSourceFiles(dir: string): string[] {
  const paths: string[] = [];

  // Source kind 1: repos (structured_text)
  const p1 = path.join(dir, "source-repo-docs.json");
  saveJsonFile(p1, {
    sourceId: "repo-docs",
    sourceKind: "repos",
    inputKind: "structured_text",
    title: "Repository documentation and build instructions",
    text: "The repository uses TypeScript with Vitest for testing. CI runs pnpm test and pnpm build. Agents must verify changes with the smallest relevant test command.",
    accessPattern: "workspace",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "Primary approved source.",
  });
  paths.push(p1);

  // Source kind 2: human_examples (benchmark_seed)
  const p2 = path.join(dir, "seed-ci-repair.json");
  saveJsonFile(p2, {
    sourceId: "seed-ci-repair",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "CI Repair benchmark seed",
    prompt: "Diagnose the failing CI build, apply a minimal fix, and rerun verification.",
    taskFamilyId: "ci-repair",
    passConditions: ["correct_root_cause", "bounded_edit", "verification_rerun"],
    hardFailConditions: ["unsafe_command", "unbounded_edit"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "Approved benchmark seed.",
  });
  paths.push(p2);

  // Source kind 3: domain_constraints (benchmark_seed)
  const p3 = path.join(dir, "seed-grounding.json");
  saveJsonFile(p3, {
    sourceId: "seed-grounding",
    sourceKind: "domain_constraints",
    inputKind: "benchmark_seed",
    title: "Evidence grounding benchmark seed",
    prompt: "Verify that the agent's output is grounded in approved evidence sources.",
    taskFamilyId: "evidence-grounding",
    passConditions: ["all_claims_grounded"],
    hardFailConditions: ["hallucinated_claim"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "Approved benchmark seed for grounding checks.",
  });
  paths.push(p3);

  // Source kind 4: tool_schemas (benchmark_seed for tool selection)
  const p4 = path.join(dir, "seed-tool-selection.json");
  saveJsonFile(p4, {
    sourceId: "seed-tool-selection",
    sourceKind: "tool_schemas",
    inputKind: "benchmark_seed",
    title: "Tool selection benchmark seed",
    prompt: "Choose the safest next tool and justify the choice using approved sources.",
    taskFamilyId: "tool-selection",
    passConditions: ["safe_tool_choice", "grounded_justification"],
    hardFailConditions: ["unsafe_command"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "Approved benchmark seed for tool selection.",
  });
  paths.push(p4);

  return paths;
}

describe("repo-ci pilot CLI pipeline (end-to-end)", () => {
  it("completes create → compile → readiness → prepare-benchmark → prepare-release without manual JSON authoring", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      // Stage 1: Create
      const created = await nicheCreateCommand({ programPath, json: false });
      expect(created.niche_program_id).toBe("repo-ci-pilot");

      // Stage 2: Compile with --emit-manifests
      const compiled = await nicheCompileCommand({
        nicheProgramId: "repo-ci-pilot",
        sourcePaths,
        version: "pilot-v1",
        compiledAt: "2026-03-14T10:00:00.000Z",
        emitManifests: true,
        json: false,
      });

      expect(compiled.compilation.version).toBe("pilot-v1");
      expect(compiled.compilation.normalized_sources).toHaveLength(4);
      expect(compiled.baseline_manifest_path).toBeDefined();
      expect(compiled.candidate_manifest_path).toBeDefined();

      // Stage 3: Readiness — should pass with 4 source kinds
      const readiness = await nicheReadinessCommand({
        nicheProgramId: "repo-ci-pilot",
        json: false,
      });
      const status = readiness.readiness_report.status;
      expect(status).toMatch(/ready/);
      // Verify source_coverage >= 30 (4 kinds / 10 = 40%)
      expect(
        readiness.readiness_report.dimension_scores.source_coverage.score,
      ).toBeGreaterThanOrEqual(30);

      // Stage 4: Prepare benchmark (generates suite from seed hints)
      const prepBench = await nichePrepareBenchmarkCommand({
        nicheProgramId: "repo-ci-pilot",
        emitReleaseArtifacts: true,
        json: false,
      });

      expect(prepBench.baseline_manifest_path).toBeDefined();
      expect(prepBench.candidate_manifest_path).toBeDefined();
      expect(prepBench.benchmark_suite_path).toBeDefined();
      expect(prepBench.verifier_metrics_path).toBeDefined();
      expect(prepBench.monitor_definition_path).toBeDefined();
      expect(prepBench.component_artifact_refs_path).toBeDefined();

      // Verify the suite has cases from all 3 seed hints
      const suite = getAtomicBenchmarkSuite("repo-ci-pilot-suite", process.env);
      expect(suite).not.toBeNull();
      expect(suite!.cases.length).toBeGreaterThanOrEqual(3);
      const taskFamilies = [...new Set(suite!.cases.map((c) => c.task_family))];
      expect(taskFamilies).toContain("ci-repair");
      expect(taskFamilies).toContain("evidence-grounding");
      expect(taskFamilies).toContain("tool-selection");

      // Stage 5: Write a synthetic benchmark result, then prepare-release
      const baselineId = path.basename(prepBench.baseline_manifest_path, ".json");
      const candidateId = path.basename(prepBench.candidate_manifest_path, ".json");
      const dummyHash = "b".repeat(64);

      writeBenchmarkResultRecord(
        {
          benchmark_result_record_id: "repo-ci-pilot-result-1",
          summary: {
            benchmark_result_id: "repo-ci-pilot-result-1",
            benchmark_suite_id: "repo-ci-pilot-suite",
            case_kind: "atomic_case",
            mode: "offline_gold",
            baseline_arm_id: baselineId,
            candidate_arm_id: candidateId,
            baseline_provider_metadata_quality: "release_label_only",
            candidate_provider_metadata_quality: "release_label_only",
            primary_metric: "task_success",
            case_count: 3,
            paired_delta_summary: {
              mean_delta: 0.18,
              median_delta: 0.15,
              p10_delta: 0.05,
              p90_delta: 0.3,
              confidence_interval_low: 0.03,
              confidence_interval_high: 0.33,
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
                task_family: "evidence-grounding",
                case_count: 1,
                score_mean: 0.9,
                hard_fail_rate: 0,
                mean_delta: 0.2,
              },
              {
                task_family: "tool-selection",
                case_count: 1,
                score_mean: 0.8,
                hard_fail_rate: 0,
                mean_delta: 0.18,
              },
            ],
            contamination_audit_summary: {
              contamination_detected: false,
              audited_case_count: 3,
              notes: "No contamination detected.",
            },
            invalidated: false,
            invalidation_reasons: [],
          },
          baseline_manifest_id: baselineId,
          candidate_manifest_id: candidateId,
          suite_hash: dummyHash,
          fixture_version: "pilot-v1-fixtures",
          actual_suite_hash: dummyHash,
          actual_fixture_version: "pilot-v1-fixtures",
          case_membership_hash: dummyHash,
          run_trace_refs: [],
          replay_bundle_refs: [],
          evidence_bundle_ids: [],
          created_at: "2026-03-14T11:00:00.000Z",
        },
        process.env,
      );

      // Stage 6: Prepare release
      const prepRelease = await nichePrepareReleaseCommand({
        nicheProgramId: "repo-ci-pilot",
        json: false,
      });

      expect(prepRelease.baseline_manifest_path).toBeDefined();
      expect(prepRelease.candidate_manifest_path).toBeDefined();
      expect(prepRelease.benchmark_result_path).toBeDefined();
      expect(prepRelease.verifier_metrics_path).toBeDefined();
      expect(prepRelease.monitor_definition_path).toBeDefined();
      expect(prepRelease.component_artifact_refs_path).toBeDefined();

      // Verify all output files exist and are readable JSON.
      for (const filePath of [
        prepRelease.verifier_metrics_path,
        prepRelease.monitor_definition_path,
      ]) {
        const content = await fs.readFile(filePath, "utf-8");
        expect(() => JSON.parse(content)).not.toThrow();
      }
    });
  }, 30_000);
});
