import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheCompareCommand } from "../../../src/commands/niche/compare.js";
import { nicheReleaseCommand } from "../../../src/commands/niche/release.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import {
  createArbitrationArtifact,
  createBenchmarkArm,
  createBenchmarkFixtureMetadata,
  createGraderArtifact,
  createGraderCalibrationRecord,
  createGraderSet,
} from "../../../src/niche/benchmark/index.js";
import { createPromotedReleaseMonitorDefinition } from "../../../src/niche/release/index.js";
import type {
  BenchmarkResultSummary,
  BenchmarkResultRecord,
  CandidateManifest,
} from "../../../src/niche/schema/index.js";
import {
  createArtifactRecord,
  ensureStoredBaselineManifest,
  ensureStoredCandidateManifest,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-release-enforcement-"));
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

function makeBaselineManifest() {
  return {
    baseline_manifest_id: "baseline-manifest-v1",
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
    source_access_manifest_id: "source-access-v1",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec", "read", "apply_patch"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: { policy: "baseline" },
    verifier_config: { pack: "verifier-v1" },
  };
}

function makeCandidateManifest(overrides: Partial<CandidateManifest> = {}): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-v1",
    based_on_baseline_manifest_id: "baseline-manifest-v1",
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
    source_access_manifest_id: "source-access-v1",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_total_tokens: 8000 },
    context_budget: { max_context_tokens: 16000 },
    execution_mode: "benchmark",
    domain_pack_id: "domain-pack-v1",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "tool-catalog-v1",
    tool_allowlist: ["exec", "read", "apply_patch"],
    tool_contract_version: "tool-contract-v1",
    retrieval_config: { policy: "baseline" },
    verifier_config: { pack: "verifier-v1" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
    ...overrides,
  };
}

function makeBenchmarkRecord(
  overrides: Partial<BenchmarkResultRecord> = {},
): BenchmarkResultRecord {
  return {
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
      case_count: 120,
      paired_delta_summary: {
        mean_delta: 0.08,
        median_delta: 0.08,
        p10_delta: 0.04,
        p90_delta: 0.1,
        confidence_interval_low: 0.02,
        confidence_interval_high: 0.12,
      },
      task_family_summaries: [
        {
          task_family: "repo-ci-verification",
          case_count: 120,
          score_mean: 0.82,
          hard_fail_rate: 0.02,
          mean_delta: 0.08,
        },
      ],
      contamination_audit_summary: {
        contamination_detected: false,
        audited_case_count: 120,
      },
      invalidated: false,
      invalidation_reasons: [],
    },
    baseline_manifest_id: "baseline-manifest-v1",
    candidate_manifest_id: "candidate-manifest-v1",
    suite_hash: "0123456789abcdef0123456789abcdef",
    fixture_version: "2026.3.12-fixtures",
    actual_suite_hash: "0123456789abcdef0123456789abcdef",
    actual_fixture_version: "2026.3.12-fixtures",
    actual_grader_version: "grader-v1",
    case_membership_hash: "fedcba9876543210fedcba9876543210",
    run_trace_refs: ["run-trace-1"],
    replay_bundle_refs: ["replay-bundle-1"],
    evidence_bundle_ids: ["evidence-bundle-1"],
    arbitration_outcome_summary: {
      arbitration_policy_id: "grader-set-v1-arbitration",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: "2026-03-12T12:02:00.000Z",
    ...overrides,
  };
}

function makeRuntimeDerivedBenchmarkRecord(): BenchmarkResultRecord {
  const runtimeBaseline = ensureStoredBaselineManifest(
    {
      ...makeBaselineManifest(),
      baseline_manifest_id: "baseline-runtime-v1",
      provider_metadata_quality: "release_label_only",
    },
    process.env,
  ).manifest;
  const runtimeCandidate = ensureStoredCandidateManifest(
    {
      ...makeCandidateManifest(),
      candidate_manifest_id: "candidate-runtime-v1",
      provider_metadata_quality: "release_label_only",
    },
    process.env,
  ).manifest;
  createBenchmarkArm(
    {
      benchmark_arm_id: "baseline-runtime-arm",
      benchmark_suite_id: "repo-ci-suite",
      manifest_id: runtimeBaseline.baseline_manifest_id,
      arm_kind: "baseline",
      mode: "offline_gold",
    },
    process.env,
  );
  createBenchmarkArm(
    {
      benchmark_arm_id: "candidate-runtime-arm",
      benchmark_suite_id: "repo-ci-suite",
      manifest_id: runtimeCandidate.candidate_manifest_id,
      arm_kind: "candidate",
      mode: "offline_gold",
    },
    process.env,
  );
  return {
    ...makeBenchmarkRecord(),
    summary: {
      ...makeBenchmarkSummary(),
      baseline_arm_id: "baseline-runtime-arm",
      candidate_arm_id: "candidate-runtime-arm",
      baseline_provider_metadata_quality: "release_label_only",
      candidate_provider_metadata_quality: "release_label_only",
    },
    baseline_manifest_id: runtimeBaseline.baseline_manifest_id,
    candidate_manifest_id: runtimeCandidate.candidate_manifest_id,
    baseline_template_manifest_id: "baseline-manifest-v1",
    candidate_template_manifest_id: "candidate-manifest-v1",
  };
}

function makeBenchmarkSummary(): BenchmarkResultSummary {
  return makeBenchmarkRecord().summary;
}

function makeVerifierMetrics() {
  return {
    sample_count: 50,
    true_positive_rate: 0.2,
    false_positive_rate: 0.04,
    false_veto_rate: 0.02,
    pass_through_rate: 0.74,
    override_rate: 0.04,
    mean_latency_added_ms: 35,
    mean_cost_added: 0.02,
    total_cost_added: 1,
    counts: {
      true_positive: 10,
      false_positive: 2,
      false_veto: 1,
      pass_through: 37,
      overrides: 2,
    },
  };
}

function materializeComponentRef() {
  const record = createArtifactRecord({
    artifact: {
      artifact_id: "release-bundle-v1",
      artifact_type: "release_bundle",
      version: "2026.3.12",
      producer: "test",
      source_trace_refs: [],
      dataset_refs: [],
      metrics: {},
      created_at: "2026-03-12T12:22:00.000Z",
      lineage: [],
    },
    rightsState: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
    },
    env: process.env,
  });
  writeLineageEdges(
    "release-bundle-v1",
    [
      {
        parent_artifact_id: "candidate-recipe-v1",
        relationship: "packaged_from",
        derivation_step: "release-build",
        notes: "Release bundle depends on the candidate recipe.",
      },
    ],
    process.env,
  );
  return record.ref;
}

function makeReadiness() {
  return {
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    status: "ready",
    dimension_scores: {
      source_quality: { score: 92, rationale: "clean" },
      source_coverage: { score: 90, rationale: "covered" },
      contradiction_rate: { score: 8, rationale: "low" },
      freshness: { score: 91, rationale: "current" },
      rights_sufficiency: { score: 95, rationale: "approved" },
      task_observability: { score: 94, rationale: "observable" },
      benchmarkability: { score: 93, rationale: "benchmarkable" },
      measurable_success_criteria: { score: 89, rationale: "measurable" },
      tool_availability: { score: 96, rationale: "available" },
    },
    hard_blockers: [],
    warnings: [],
    recommended_next_actions: [],
    generated_at: "2026-03-12T12:00:00.000Z",
  };
}

function seedBenchmarkArms() {
  createBenchmarkArm(
    {
      benchmark_arm_id: "baseline-arm",
      benchmark_suite_id: "repo-ci-suite",
      manifest_id: "baseline-manifest-v1",
      arm_kind: "baseline",
      mode: "offline_gold",
    },
    process.env,
  );
  createBenchmarkArm(
    {
      benchmark_arm_id: "candidate-arm",
      benchmark_suite_id: "repo-ci-suite",
      manifest_id: "candidate-manifest-v1",
      arm_kind: "candidate",
      mode: "offline_gold",
    },
    process.env,
  );
}

function seedGovernance(params: {
  promotionEligible?: boolean;
  smeSampleCount?: number;
  requiredSmeSampleCount?: number;
}) {
  const graderRef = {
    artifact_id: "grader-v1",
    artifact_type: "grader" as const,
    version: "2026.3.12",
    content_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    rights_state: {
      rights_to_store: true,
      rights_to_train: false,
      rights_to_benchmark: true,
      rights_to_derive: false,
      rights_to_distill: false,
      rights_to_generate_synthetic_from: false,
    },
    created_at: "2026-03-12T12:00:00.000Z",
  };
  createGraderArtifact(
    {
      grader_id: "grader-v1",
      grader_type: "deterministic_rule",
      version: "2026.3.12",
      owner: "quality-team",
      calibration_suite_id: "calibration-suite-v1",
      prompt_or_rule_hash: "rule-hash-v1",
      decision_schema: "task_success:boolean",
      expected_failure_modes: ["unsupported-claim"],
      created_at: "2026-03-12T12:00:00.000Z",
    },
    process.env,
  );
  createBenchmarkFixtureMetadata(
    {
      fixture_metadata_id: "grader-set-v1-fixture",
      benchmark_suite_id: "repo-ci-suite",
      suite_hash: "0123456789abcdef0123456789abcdef",
      fixture_pack_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      environment_snapshot_hash: "cccccccccccccccccccccccccccccccc",
      created_at: "2026-03-12T12:00:00.000Z",
    },
    process.env,
  );
  createArbitrationArtifact(
    {
      arbitration_policy_id: "grader-set-v1-arbitration",
      grader_refs: [graderRef],
      conflict_resolution_mode: "rule_first",
      sme_sampling_rate: 0.2,
      promotion_blocking_conflict_types: ["grader_disagreement"],
    },
    process.env,
  );
  createGraderSet(
    {
      grader_set_id: "grader-set-v1",
      grader_refs: [graderRef],
      arbitration_policy_id: "grader-set-v1-arbitration",
      fixture_metadata_id: "grader-set-v1-fixture",
      created_at: "2026-03-12T12:00:00.000Z",
    },
    process.env,
  );
  if (params.promotionEligible !== undefined || params.smeSampleCount !== undefined) {
    createGraderCalibrationRecord(
      {
        grader_id: "grader-v1",
        grader_set_id: "grader-set-v1",
        calibration_suite_id: "calibration-suite-v1",
        precision: 0.92,
        recall: 0.9,
        agreement_rate: 0.92,
        sme_sample_count: params.smeSampleCount ?? 24,
        required_sme_sample_count: params.requiredSmeSampleCount ?? 20,
        promotion_eligible: params.promotionEligible ?? true,
        version: "2026.3.12",
        created_at: "2026-03-12T12:00:00.000Z",
      },
      process.env,
    );
  }
}

function writeReleaseFixtures(
  dir: string,
  params: {
    candidateManifest?: CandidateManifest;
    benchmarkRecord?: BenchmarkResultRecord;
    requiredCaseKinds?: Array<"atomic_case" | "episode_case">;
  },
) {
  const baselineManifestPath = path.join(dir, "baseline.json");
  const candidateManifestPath = path.join(dir, "candidate.json");
  const benchmarkPath = path.join(dir, "benchmark.json");
  const verifierMetricsPath = path.join(dir, "verifier.json");
  const monitorPath = path.join(dir, "monitor.json");
  const componentRefPath = path.join(dir, "component-ref.json");
  const readinessPath = path.join(dir, "readiness.json");

  saveJsonFile(baselineManifestPath, makeBaselineManifest());
  saveJsonFile(candidateManifestPath, params.candidateManifest ?? makeCandidateManifest());
  saveJsonFile(benchmarkPath, params.benchmarkRecord ?? makeBenchmarkRecord());
  saveJsonFile(verifierMetricsPath, makeVerifierMetrics());
  saveJsonFile(componentRefPath, materializeComponentRef());
  saveJsonFile(readinessPath, makeReadiness());
  saveJsonFile(
    monitorPath,
    createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "candidate-release-v1",
      baselineManifestId: "baseline-manifest-v1",
      candidateManifestId: "candidate-manifest-v1",
      requiredCaseKinds: params.requiredCaseKinds ?? ["atomic_case"],
      driftThresholds: {
        task_success_drift: 0.2,
        task_family_drift: 0.2,
        verifier_false_veto_drift: 0.1,
        grader_disagreement_drift: 0.1,
        source_freshness_decay: 0.3,
        latency_cost_drift: 0.2,
        hard_fail_drift: 0.1,
      },
      verifierDriftThresholds: {
        task_success_drift: 0.2,
        task_family_drift: 0.2,
        verifier_false_veto_drift: 0.1,
        grader_disagreement_drift: 0.1,
        source_freshness_decay: 0.3,
        latency_cost_drift: 0.2,
        hard_fail_drift: 0.1,
      },
      graderDriftThresholds: {
        task_success_drift: 0.2,
        task_family_drift: 0.2,
        verifier_false_veto_drift: 0.1,
        grader_disagreement_drift: 0.1,
        source_freshness_decay: 0.3,
        latency_cost_drift: 0.2,
        hard_fail_drift: 0.1,
      },
    }),
  );

  return {
    baselineManifestPath,
    candidateManifestPath,
    benchmarkPath,
    verifierMetricsPath,
    monitorPath,
    componentRefPath,
    readinessPath,
  };
}

const runtime = {
  log: () => {},
  error: () => {},
  exit: () => {},
};

describe("release and compare enforcement", () => {
  it("blocks comparison when candidate execution pinning diverges from baseline", async () => {
    const dir = await makeTempDir();
    const candidateManifest = makeCandidateManifest({
      tool_allowlist: ["exec"],
    });
    const result = await nicheCompareCommand(
      {
        baselineManifestPath: writeReleaseFixtures(dir, { candidateManifest }).baselineManifestPath,
        candidateManifestPath: path.join(dir, "candidate.json"),
        json: true,
      },
      runtime,
    );

    expect(result.manifests_comparable).toBe(false);
    expect(result.comparison_issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining("tool_allowlist"),
        }),
      ]),
    );
  });

  it("blocks release when candidate execution pinning diverges from baseline", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({ promotionEligible: true });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {
        candidateManifest: makeCandidateManifest({
          verifier_config: { pack: "verifier-v2" },
        }),
      });

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("verifier_config")]),
      );
    });
  });

  it("accepts runtime-derived benchmark manifest ids when template bindings still match", async () => {
    await withTempHome(async () => {
      seedGovernance({ promotionEligible: true });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {
        benchmarkRecord: makeRuntimeDerivedBenchmarkRecord(),
      });

      const compareResult = await nicheCompareCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          json: true,
        },
        runtime,
      );

      expect(compareResult.governance_issues).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining("baseline manifest"),
          expect.stringContaining("candidate manifest"),
        ]),
      );
    });
  });

  it("rejects promotion when required case kinds are missing", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({ promotionEligible: true });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {
        requiredCaseKinds: ["atomic_case", "episode_case"],
      });

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("episode_case")]),
      );
    });
  });

  it("rejects benchmark records that lack durable refs", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({ promotionEligible: true });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {
        benchmarkRecord: {
          ...makeBenchmarkRecord(),
          run_trace_refs: [],
          replay_bundle_refs: [],
          evidence_bundle_ids: [],
        },
      });

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("durable run/replay/evidence refs")]),
      );
    });
  });

  it("rejects summary-only benchmark JSON before policy evaluation", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({ promotionEligible: true });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {});
      saveJsonFile(files.benchmarkPath, makeBenchmarkSummary());

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("summary-only JSON")]),
      );
    });
  });

  it("blocks release when grader calibration is missing", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({});
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {});

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("Missing grader calibration record")]),
      );
    });
  });

  it("blocks release when grader calibration is non-promotable or undersampled", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({ promotionEligible: false, smeSampleCount: 4, requiredSmeSampleCount: 20 });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {});

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining("not promotion-eligible"),
          expect.stringContaining("insufficient SME sampling"),
        ]),
      );
    });
  });

  it("blocks release when arbitration still has unresolved blocking conflicts", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({ promotionEligible: true });
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {
        benchmarkRecord: {
          ...makeBenchmarkRecord(),
          arbitration_outcome_summary: {
            arbitration_policy_id: "grader-set-v1-arbitration",
            unresolved_blocking_conflicts: true,
            unresolved_conflict_count: 2,
            blocking_conflict_types: ["grader_disagreement"],
          },
        },
      });

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          verifierMetricsPath: files.verifierMetricsPath,
          monitorDefinitionPath: files.monitorPath,
          componentArtifactRefPaths: [files.componentRefPath],
          readinessReportPath: files.readinessPath,
        },
        runtime,
      );

      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining("unresolved blocking arbitration conflicts"),
        ]),
      );
    });
  });

  it("surfaces governance issues in compare without a full release-policy bundle", async () => {
    await withTempHome(async () => {
      seedBenchmarkArms();
      seedGovernance({});
      const dir = await makeTempDir();
      const files = writeReleaseFixtures(dir, {});

      const result = await nicheCompareCommand(
        {
          baselineManifestPath: files.baselineManifestPath,
          candidateManifestPath: files.candidateManifestPath,
          benchmarkResultPaths: [files.benchmarkPath],
          json: true,
        },
        runtime,
      );

      expect(result.release_policy).toBeUndefined();
      expect(result.governance_issues).toEqual(
        expect.arrayContaining([expect.stringContaining("Missing grader calibration record")]),
      );
    });
  });
});
