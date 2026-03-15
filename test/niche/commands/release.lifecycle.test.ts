import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { createArtifactRecord, writeLineageEdges } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];
const runNicheLifecycle = vi.fn(async () => {});
const resolveSpecializationReadiness = vi.fn(() => ({
  readiness_report_id: "repo-ci-specialist-readiness",
  niche_program_id: "repo-ci-specialist",
  status: "ready",
  dimension_scores: {
    source_quality: { score: 92, rationale: "ready" },
    source_coverage: { score: 90, rationale: "ready" },
    contradiction_rate: { score: 8, rationale: "ready" },
    freshness: { score: 91, rationale: "ready" },
    rights_sufficiency: { score: 95, rationale: "ready" },
    task_observability: { score: 94, rationale: "ready" },
    benchmarkability: { score: 93, rationale: "ready" },
    measurable_success_criteria: { score: 89, rationale: "ready" },
    tool_availability: { score: 96, rationale: "ready" },
  },
  hard_blockers: [],
  warnings: [],
  recommended_next_actions: [],
  generated_at: "2026-03-12T12:00:00.000Z",
}));
const getBenchmarkArm = vi.fn((armId: string) => {
  if (armId === "baseline-arm") {
    return {
      benchmark_arm_id: "baseline-arm",
      benchmark_suite_id: "repo-ci-suite",
      manifest_id: "baseline-manifest-repo-ci",
      arm_kind: "baseline",
      mode: "offline_gold",
    };
  }
  if (armId === "candidate-arm") {
    return {
      benchmark_arm_id: "candidate-arm",
      benchmark_suite_id: "repo-ci-suite",
      manifest_id: "candidate-manifest-repo-ci",
      arm_kind: "candidate",
      mode: "offline_gold",
    };
  }
  return null;
});
const getGraderSet = vi.fn(() => ({
  grader_set_id: "grader-set-v1",
  arbitration_policy_id: "arbitration-v1",
  fixture_metadata_id: "fixture-meta-v1",
  grader_refs: [{ artifact_type: "grader", artifact_id: "grader-task-success" }],
}));
const getArbitrationArtifact = vi.fn(() => ({ arbitration_policy_id: "arbitration-v1" }));
const getBenchmarkFixtureMetadata = vi.fn(() => ({
  fixture_metadata_id: "fixture-meta-v1",
  benchmark_suite_id: "repo-ci-suite",
}));
const getGraderArtifact = vi.fn(() => ({ grader_id: "grader-task-success" }));
const getGraderCalibrationRecord = vi.fn(() => ({
  grader_id: "grader-task-success",
  grader_set_id: "grader-set-v1",
  calibration_suite_id: "calibration-suite-v1",
  precision: 0.92,
  recall: 0.9,
  agreement_rate: 0.92,
  sme_sample_count: 24,
  required_sme_sample_count: 20,
  promotion_eligible: true,
  version: "2026.3.12",
  created_at: "2026-03-12T12:00:00.000Z",
}));
const validateBenchmarkRecordBindingsAgainstInput = vi.fn(() => []);
const evaluateReleasePolicy = vi.fn(() => ({
  eligible: true,
  reasons: [],
  warnings: [],
  aggregated_metrics: {
    benchmark_mean_delta: 0.2,
    benchmark_low_confidence_bound: 0.1,
    verifier_false_veto_rate: 0,
    false_veto_rate: 0,
    override_rate: 0,
    latency_regression: 0,
    cost_regression: 0,
    shadow_hard_fail_rate: 0,
  },
}));
const createPromotionControllerResult = vi.fn(() => ({
  decision: "promoted",
  reason: "Candidate clears release policy.",
  candidate_release: {
    candidate_release_id: "candidate-release-v1",
    rollback_target: "baseline-release-v1",
  },
}));
const assessPromotedReleaseMonitor = vi.fn();

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: (hookName: string) => hookName === "niche_lifecycle",
    runNicheLifecycle,
  }),
}));

vi.mock("../../../src/niche/domain/index.js", () => ({
  resolveSpecializationReadiness,
}));

vi.mock("../../../src/niche/benchmark/index.js", () => ({
  getBenchmarkArm,
  getGraderSet,
  getArbitrationArtifact,
  getBenchmarkFixtureMetadata,
  getGraderArtifact,
  getGraderCalibrationRecord,
  validateBenchmarkRecordBindingsAgainstInput,
}));

vi.mock("../../../src/niche/release/index.js", () => ({
  evaluateReleasePolicy,
  createPromotionControllerResult,
  assessPromotedReleaseMonitor,
}));

const { nicheReleaseCommand } = await import("../../../src/commands/niche/release.js");

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-release-lifecycle-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  runNicheLifecycle.mockReset();
  runNicheLifecycle.mockResolvedValue(undefined);
  resolveSpecializationReadiness.mockClear();
  getBenchmarkArm.mockClear();
  getGraderSet.mockClear();
  getArbitrationArtifact.mockClear();
  getBenchmarkFixtureMetadata.mockClear();
  getGraderArtifact.mockClear();
  getGraderCalibrationRecord.mockClear();
  validateBenchmarkRecordBindingsAgainstInput.mockClear();
  evaluateReleasePolicy.mockClear();
  createPromotionControllerResult.mockClear();
  assessPromotedReleaseMonitor.mockClear();
});

function writeFixtures(dir: string) {
  const baselineManifestPath = path.join(dir, "baseline.json");
  const candidateManifestPath = path.join(dir, "candidate.json");
  const benchmarkResultPath = path.join(dir, "benchmark.json");
  const verifierMetricsPath = path.join(dir, "verifier.json");
  const monitorDefinitionPath = path.join(dir, "monitor.json");
  const componentArtifactRefPath = path.join(dir, "artifact-ref.json");

  saveJsonFile(baselineManifestPath, {
    baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    provider_metadata_quality: "exact_snapshot",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "prompt-v1",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-repo-ci",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
  });

  saveJsonFile(candidateManifestPath, {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:01:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    provider_metadata_quality: "exact_snapshot",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "prompt-v2",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-repo-ci",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    domain_pack_id: "domain-pack-v1",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  });

  saveJsonFile(benchmarkResultPath, {
    benchmark_result_record_id: "benchmark-record-v1",
    summary: {
      benchmark_result_id: "benchmark-result-v1",
      benchmark_suite_id: "repo-ci-suite",
      case_kind: "atomic_case",
      mode: "offline_gold",
      baseline_arm_id: "baseline-arm",
      candidate_arm_id: "candidate-arm",
      baseline_provider_metadata_quality: "exact_snapshot",
      candidate_provider_metadata_quality: "exact_snapshot",
      primary_metric: "task_success",
      case_count: 10,
      paired_delta_summary: {
        mean_delta: 0.2,
        median_delta: 0.2,
        p10_delta: 0.1,
        p90_delta: 0.3,
        confidence_interval_low: 0.1,
        confidence_interval_high: 0.3,
      },
      task_family_summaries: [
        {
          task_family: "repo_navigation",
          case_count: 10,
          score_mean: 0.9,
          hard_fail_rate: 0,
          mean_delta: 0.2,
        },
      ],
      contamination_audit_summary: {
        contamination_detected: false,
        audited_case_count: 10,
      },
      invalidated: false,
      invalidation_reasons: [],
    },
    baseline_manifest_id: "baseline-manifest-repo-ci",
    candidate_manifest_id: "candidate-manifest-repo-ci",
    suite_hash: "0123456789abcdef0123456789abcdef",
    fixture_version: "2026.3.12-fixtures",
    actual_suite_hash: "0123456789abcdef0123456789abcdef",
    actual_fixture_version: "2026.3.12-fixtures",
    actual_grader_version: "grader-task-success",
    case_membership_hash: "fedcba9876543210fedcba9876543210",
    run_trace_refs: ["run-trace-1"],
    replay_bundle_refs: ["replay-bundle-1"],
    evidence_bundle_ids: ["evidence-bundle-1"],
    arbitration_outcome_summary: {
      arbitration_policy_id: "arbitration-v1",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: "2026-03-12T12:02:00.000Z",
  });

  saveJsonFile(verifierMetricsPath, {
    sample_count: 10,
    true_positive_rate: 1,
    false_positive_rate: 0,
    false_veto_rate: 0,
    pass_through_rate: 1,
    override_rate: 0,
    mean_latency_added_ms: 0,
    mean_cost_added: 0,
    total_cost_added: 0,
    counts: {
      approved: 10,
      vetoed: 0,
      escalated: 0,
      repair_requested: 0,
    },
  });

  saveJsonFile(monitorDefinitionPath, {
    monitor: {
      promoted_release_id: "candidate-release-v1",
      baseline_manifest_id: "baseline-manifest-repo-ci",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      required_case_kinds: ["atomic_case"],
      shadow_recheck_policy: {
        policy_id: "shadow-recheck-v1",
        summary: "Re-run shadow checks every 24 hours.",
      },
      drift_thresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.02,
        source_freshness_decay: 12,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.02,
      },
      verifier_drift_thresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.02,
        source_freshness_decay: 12,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.02,
      },
      grader_drift_thresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.02,
        source_freshness_decay: 12,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.02,
      },
      freshness_decay_policy: {
        policy_id: "freshness-v1",
        summary: "Recompile when freshness drops.",
      },
      rollback_policy: {
        policy_id: "rollback-v1",
        summary: "Rollback on sustained drift.",
      },
    },
    cadence_defaults: {
      shadow_recheck_interval_hours: 24,
      evaluation_window_size: 3,
      alert_hysteresis_windows: 2,
      rollback_cooldown_hours: 24,
    },
  });

  const componentRecord = createArtifactRecord({
    artifact: {
      artifact_id: "artifact-repo-ci",
      artifact_type: "dataset",
      version: "2026.3.12",
      producer: "test",
      source_trace_refs: [],
      dataset_refs: [],
      metrics: {},
      governed_data_status: {
        data_zone: "dev",
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        quarantined: false,
      },
      created_at: "2026-03-12T12:00:00.000Z",
      lineage: [],
    },
    rightsState: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: false,
      rights_to_generate_synthetic_from: true,
    },
    env: process.env,
  });
  writeLineageEdges(
    "artifact-repo-ci",
    [
      {
        parent_artifact_id: "candidate-recipe-v1",
        relationship: "derived_from",
        derivation_step: "release-assembly",
        notes: "Component ref descends from the candidate recipe.",
      },
    ],
    process.env,
  );
  saveJsonFile(componentArtifactRefPath, componentRecord.ref);

  return {
    baselineManifestPath,
    candidateManifestPath,
    benchmarkResultPath,
    verifierMetricsPath,
    monitorDefinitionPath,
    componentArtifactRefPath,
  };
}

describe("nicheReleaseCommand lifecycle emission", () => {
  it("emits candidate_promoted from the release command path", async () => {
    const dir = await makeTempDir();
    const files = writeFixtures(dir);
    const runtime = {
      log: vi.fn(),
    };

    await nicheReleaseCommand(
      {
        baselineManifestPath: files.baselineManifestPath,
        candidateManifestPath: files.candidateManifestPath,
        benchmarkResultPaths: [files.benchmarkResultPath],
        verifierMetricsPath: files.verifierMetricsPath,
        monitorDefinitionPath: files.monitorDefinitionPath,
        componentArtifactRefPaths: [files.componentArtifactRefPath],
        json: true,
      },
      runtime as never,
    );

    await vi.waitFor(() => {
      expect(runNicheLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "candidate_promoted",
          baseline_manifest_id: "baseline-manifest-repo-ci",
          candidate_manifest_id: "candidate-manifest-repo-ci",
          payload: {
            candidate_release_id: "candidate-release-v1",
            rollback_target: "baseline-release-v1",
          },
        }),
        expect.objectContaining({
          trigger: "niche",
        }),
      );
    });
  });

  it("emits candidate_rejected lifecycle event when decision is rejected", async () => {
    await withTempHome(async () => {
      createPromotionControllerResult.mockReturnValueOnce({
        decision: "rejected",
        reason: "Candidate does not clear release policy thresholds.",
        candidate_release: {
          candidate_release_id: "candidate-release-rejected",
          rollback_target: "baseline-release-v1",
        },
      });

      const dir = await makeTempDir();
      const files = writeFixtures(dir);
      const runtime = { log: vi.fn() };

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkResultPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorDefinitionPath,
          componentArtifactRefPaths: [files.componentArtifactRefPath],
          json: true,
        },
        runtime as never,
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      // When decision is "rejected", the lifecycle event for candidate_promoted should NOT fire
      expect(runNicheLifecycle).not.toHaveBeenCalled();
    });
  });

  it("propagates blocking reasons from release policy evaluation", async () => {
    await withTempHome(async () => {
      evaluateReleasePolicy.mockReturnValueOnce({
        eligible: false,
        reasons: ["Benchmark delta below threshold.", "Shadow hard-fail rate too high."],
        warnings: ["Latency regression detected."],
        aggregated_metrics: {
          benchmark_mean_delta: -0.1,
          benchmark_low_confidence_bound: -0.2,
          verifier_false_veto_rate: 0,
          false_veto_rate: 0,
          override_rate: 0,
          latency_regression: 0.15,
          cost_regression: 0,
          shadow_hard_fail_rate: 0.05,
        },
      });
      createPromotionControllerResult.mockReturnValueOnce({
        decision: "rejected",
        reason: "Release policy not satisfied.",
        candidate_release: {
          candidate_release_id: "candidate-release-blocked",
          rollback_target: "baseline-release-v1",
        },
      });

      const dir = await makeTempDir();
      const files = writeFixtures(dir);
      const runtime = { log: vi.fn() };

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkResultPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorDefinitionPath,
          componentArtifactRefPaths: [files.componentArtifactRefPath],
          json: true,
        },
        runtime as never,
      );

      expect(result.policy_evaluation.eligible).toBe(false);
      expect(result.policy_evaluation.reasons).toContain("Benchmark delta below threshold.");
      expect(result.policy_evaluation.reasons).toContain("Shadow hard-fail rate too high.");
      expect(result.policy_evaluation.warnings).toContain("Latency regression detected.");
      expect(result.promotion_controller.decision).toBe("rejected");
    });
  });

  it("includes monitor assessment when observation path is provided", async () => {
    await withTempHome(async () => {
      assessPromotedReleaseMonitor.mockReturnValueOnce({
        should_rollback: false,
        signals: [],
        summary: "No drift detected.",
      });

      const dir = await makeTempDir();
      const files = writeFixtures(dir);
      const runtime = { log: vi.fn() };

      // Write a monitor observation file
      const monitorObservationPath = path.join(dir, "monitor-observation.json");
      saveJsonFile(monitorObservationPath, {
        observed_drift: {
          task_success_drift: 0.01,
          task_family_drift: 0.01,
          verifier_false_veto_drift: 0.0,
          grader_disagreement_drift: 0.0,
          source_freshness_decay: 1,
          latency_cost_drift: 0.01,
          hard_fail_drift: 0.0,
        },
        consecutive_breach_windows: 0,
      });

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkResultPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorDefinitionPath,
          componentArtifactRefPaths: [files.componentArtifactRefPath],
          monitorObservationPath,
          json: true,
        },
        runtime as never,
      );

      expect(result.monitor_assessment).toBeDefined();
      expect(result.monitor_assessment!.should_rollback).toBe(false);
      expect(assessPromotedReleaseMonitor).toHaveBeenCalledWith(
        expect.objectContaining({
          definition: expect.objectContaining({
            monitor: expect.objectContaining({
              promoted_release_id: "candidate-release-v1",
            }),
          }),
          observation: expect.objectContaining({
            consecutive_breach_windows: 0,
          }),
        }),
      );
    });
  });

  it("throws when verifier metrics path points to a missing file", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const files = writeFixtures(dir);
      const runtime = { log: vi.fn() };

      await expect(
        nicheReleaseCommand(
          {
            baselineManifestPath: files.baselineManifestPath,
            candidateManifestPath: files.candidateManifestPath,
            benchmarkResultPaths: [files.benchmarkResultPath],
            verifierMetricsPath: path.join(dir, "nonexistent-verifier.json"),
            monitorDefinitionPath: files.monitorDefinitionPath,
            componentArtifactRefPaths: [files.componentArtifactRefPath],
            json: true,
          },
          runtime as never,
        ),
      ).rejects.toThrow(/nonexistent-verifier|not found|ENOENT|does not exist/i);
    });
  });
});
