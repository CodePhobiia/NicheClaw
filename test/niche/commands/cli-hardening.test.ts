import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheBenchmarkCommand } from "../../../src/commands/niche/benchmark.js";
import { nicheCompareCommand } from "../../../src/commands/niche/compare.js";
import { nicheInspectCommand } from "../../../src/commands/niche/inspect.js";
import { nicheReleaseCommand } from "../../../src/commands/niche/release.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import {
  createArbitrationArtifact,
  createBenchmarkArm,
  createBenchmarkFixtureMetadata,
  createGraderCalibrationRecord,
  createGraderArtifact,
  createGraderSet,
  getBenchmarkArm,
} from "../../../src/niche/benchmark/index.js";
import { createPromotedReleaseMonitorDefinition } from "../../../src/niche/release/index.js";
import type {
  BaselineManifest,
  BenchmarkResultSummary,
  CandidateManifest,
} from "../../../src/niche/schema/index.js";
import { createArtifactRecord, writeLineageEdges } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-cli-hardening-"));
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

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "repo-ci-baseline",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Baseline planner runtime.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned baseline metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-baseline",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-atomic-pilot",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Repo baseline",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read_file", "run_command", "write_file"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "pilot" },
    verifier_config: { verifier_pack: "repo-ci-verifier" },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "repo-ci-candidate",
    based_on_baseline_manifest_id: "repo-ci-baseline",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:01:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Candidate planner runtime.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "release_label_only",
    provider_runtime_notes: "Candidate metadata bounded.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-atomic-pilot",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Repo candidate",
    domain_pack_id: "repo-ci-specialist-repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read_file", "run_command", "write_file"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "pilot" },
    verifier_config: { verifier_pack: "repo-ci-verifier" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeAtomicSuite() {
  return {
    metadata: {
      benchmark_suite_id: "repo-ci-atomic-pilot",
      case_kind: "atomic_case" as const,
      mode: "offline_gold" as const,
      split: "gold_eval",
      created_at: "2026-03-12T12:00:00.000Z",
      suite_version: "2026.3.12",
      suite_hash: "0123456789abcdef0123456789abcdef",
      fixture_version: "2026.3.12-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["repo_navigation", "tool_selection", "repair_loop"],
    },
    cases: [
      {
        eval_case_id: "eval-case-1",
        suite_id: "repo-ci-atomic-pilot",
        split: "gold_eval",
        task_family: "repo_navigation",
        input: { prompt: "Find the entrypoint." },
        allowed_tools: ["read", "exec"],
        allowed_sources: ["repo-root"],
        grader_spec: {
          grader_refs: ["grader-v1"],
          primary_metric: "task_success",
        },
        pass_conditions: ["correct_entrypoint"],
        hard_fail_conditions: [],
        difficulty: 1,
        seed: "seed-1",
      },
      {
        eval_case_id: "eval-case-2",
        suite_id: "repo-ci-atomic-pilot",
        split: "gold_eval",
        task_family: "tool_selection",
        input: { prompt: "Pick the safest tool." },
        allowed_tools: ["read", "exec"],
        allowed_sources: ["repo-root"],
        grader_spec: {
          grader_refs: ["grader-v1"],
          primary_metric: "task_success",
        },
        pass_conditions: ["safe_tool_choice"],
        hard_fail_conditions: [],
        difficulty: 1,
        seed: "seed-2",
      },
      {
        eval_case_id: "eval-case-3",
        suite_id: "repo-ci-atomic-pilot",
        split: "gold_eval",
        task_family: "repair_loop",
        input: { prompt: "Make the smallest durable fix." },
        allowed_tools: ["read", "exec", "apply_patch"],
        allowed_sources: ["repo-root"],
        grader_spec: {
          grader_refs: ["grader-v1"],
          primary_metric: "task_success",
        },
        pass_conditions: ["bounded_fix"],
        hard_fail_conditions: [],
        difficulty: 2,
        seed: "seed-3",
      },
    ],
  };
}

function makeAtomicExecutionBundle(score: number) {
  return {
    cases: {
      "eval-case-1": {
        score,
        hard_fail: false,
        latency_ms: 100,
        cost: 0.01,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      },
      "eval-case-2": {
        score,
        hard_fail: false,
        latency_ms: 100,
        cost: 0.01,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      },
      "eval-case-3": {
        score,
        hard_fail: false,
        latency_ms: 100,
        cost: 0.01,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      },
    },
  };
}

function makeReleaseBenchmarkSummary(): BenchmarkResultSummary {
  return {
    benchmark_result_id: "benchmark-result-1",
    benchmark_suite_id: "repo-ci-atomic-pilot",
    case_kind: "atomic_case",
    mode: "offline_gold",
    baseline_arm_id: "benchmark-arm-baseline",
    candidate_arm_id: "benchmark-arm-candidate",
    baseline_provider_metadata_quality: "exact_snapshot",
    candidate_provider_metadata_quality: "release_label_only",
    primary_metric: "task_success",
    case_count: 120,
    paired_delta_summary: {
      mean_delta: 0.08,
      median_delta: 0.08,
      p10_delta: 0.04,
      p90_delta: 0.1,
      confidence_interval_low: 0.03,
      confidence_interval_high: 0.12,
    },
    task_family_summaries: [
      {
        task_family: "repo_navigation",
        case_count: 40,
        score_mean: 0.82,
        hard_fail_rate: 0.02,
        mean_delta: 0.08,
      },
      {
        task_family: "tool_selection",
        case_count: 40,
        score_mean: 0.8,
        hard_fail_rate: 0.02,
        mean_delta: 0.08,
      },
      {
        task_family: "repair_loop",
        case_count: 40,
        score_mean: 0.84,
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
  };
}

function makeReleaseBenchmarkRecord() {
  return {
    benchmark_result_record_id: "benchmark-record-1",
    summary: makeReleaseBenchmarkSummary(),
    baseline_manifest_id: "repo-ci-baseline",
    candidate_manifest_id: "repo-ci-candidate",
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
      arbitration_policy_id: "2026.3.12-arbitration",
      unresolved_blocking_conflicts: false,
      unresolved_conflict_count: 0,
      blocking_conflict_types: [],
    },
    created_at: "2026-03-12T12:20:00.000Z",
  };
}

function makeReadinessReport(status: "ready" | "ready_with_warnings" | "not_ready" = "ready") {
  return {
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    status,
    dimension_scores: {
      source_quality: { score: 92, rationale: "Repo sources are clean." },
      source_coverage: { score: 90, rationale: "Coverage spans repo and CI." },
      contradiction_rate: { score: 8, rationale: "Contradictions are low." },
      freshness: { score: 91, rationale: "Sources are current." },
      rights_sufficiency: { score: 95, rationale: "Rights are approved." },
      task_observability: { score: 94, rationale: "Tool execution is observable." },
      benchmarkability: { score: 93, rationale: "Held-out cases exist." },
      measurable_success_criteria: { score: 89, rationale: "Success is measurable." },
      tool_availability: { score: 96, rationale: "Required tools are available." },
    },
    hard_blockers:
      status === "not_ready"
        ? [
            {
              blocker_code: "benchmarkability_below_minimum_threshold",
              message: "The niche is not benchmarkable enough for specialization.",
            },
          ]
        : [],
    warnings: [],
    recommended_next_actions: [],
    generated_at: "2026-03-12T12:10:00.000Z",
  };
}

function seedGraderGovernance(graderSetId: string, benchmarkSuiteId: string) {
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
  createGraderCalibrationRecord(
    {
      grader_id: "grader-v1",
      grader_set_id: graderSetId,
      calibration_suite_id: "calibration-suite-v1",
      precision: 0.92,
      recall: 0.9,
      agreement_rate: 0.92,
      sme_sample_count: 24,
      required_sme_sample_count: 20,
      promotion_eligible: true,
      version: "2026.3.12",
      created_at: "2026-03-12T12:00:00.000Z",
    },
    process.env,
  );
  createArbitrationArtifact(
    {
      arbitration_policy_id: `${graderSetId}-arbitration`,
      grader_refs: [graderRef],
      conflict_resolution_mode: "rule_first",
      sme_sampling_rate: 0.2,
      promotion_blocking_conflict_types: ["grader_disagreement"],
    },
    process.env,
  );
  createBenchmarkFixtureMetadata(
    {
      fixture_metadata_id: `${graderSetId}-fixture`,
      benchmark_suite_id: benchmarkSuiteId,
      suite_hash: "0123456789abcdef0123456789abcdef",
      fixture_pack_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      environment_snapshot_hash: "cccccccccccccccccccccccccccccccc",
      created_at: "2026-03-12T12:00:00.000Z",
    },
    process.env,
  );
  createGraderSet(
    {
      grader_set_id: graderSetId,
      grader_refs: [graderRef],
      arbitration_policy_id: `${graderSetId}-arbitration`,
      fixture_metadata_id: `${graderSetId}-fixture`,
      created_at: "2026-03-12T12:00:00.000Z",
    },
    process.env,
  );
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
        notes: "Release bundle depends on candidate recipe.",
      },
    ],
    process.env,
  );
  return record.ref;
}

describe("niche CLI hardening", () => {
  it("reports malformed benchmark input JSON clearly", async () => {
    const dir = await makeTempDir();
    const baselinePath = path.join(dir, "baseline.json");
    const candidatePath = path.join(dir, "candidate.json");
    const suitePath = path.join(dir, "suite.json");
    const baselineExecPath = path.join(dir, "baseline-exec.json");
    const candidateExecPath = path.join(dir, "candidate-exec.json");
    const readinessPath = path.join(dir, "readiness.json");

    saveJsonFile(baselinePath, makeBaselineManifest());
    saveJsonFile(candidatePath, makeCandidateManifest());
    await fs.writeFile(suitePath, "{ invalid-json", "utf8");
    saveJsonFile(baselineExecPath, { cases: {} });
    saveJsonFile(candidateExecPath, { cases: {} });
    saveJsonFile(readinessPath, makeReadinessReport());

    await expect(
      nicheBenchmarkCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          suitePath,
          baselineExecutionPath: baselineExecPath,
          candidateExecutionPath: candidateExecPath,
          readinessReportPath: readinessPath,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      ),
    ).rejects.toThrow(/Invalid JSON in/);
  });

  it("persists benchmark arms and emits stored arm ids in benchmark summaries", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const baselinePath = path.join(dir, "baseline.json");
      const candidatePath = path.join(dir, "candidate.json");
      const suitePath = path.join(dir, "suite.json");
      const baselineExecPath = path.join(dir, "baseline-exec.json");
      const candidateExecPath = path.join(dir, "candidate-exec.json");
      const readinessPath = path.join(dir, "readiness.json");

      saveJsonFile(baselinePath, makeBaselineManifest());
      saveJsonFile(candidatePath, makeCandidateManifest());
      saveJsonFile(suitePath, makeAtomicSuite());
      saveJsonFile(baselineExecPath, makeAtomicExecutionBundle(0.4));
      saveJsonFile(candidateExecPath, makeAtomicExecutionBundle(0.8));
      saveJsonFile(readinessPath, makeReadinessReport("ready_with_warnings"));

      const result = await nicheBenchmarkCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          suitePath,
          baselineExecutionPath: baselineExecPath,
          candidateExecutionPath: candidateExecPath,
          readinessReportPath: readinessPath,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      );

      expect(getBenchmarkArm(result.baseline_arm.benchmark_arm_id, process.env)).toEqual(
        result.baseline_arm,
      );
      expect(getBenchmarkArm(result.candidate_arm.benchmark_arm_id, process.env)).toEqual(
        result.candidate_arm,
      );
      expect(result.input_mode).toBe("typed_execution_bundle");
      expect(result.authority_mode).toBe("legacy_non_authoritative");
      expect(result.benchmark_result_record_id).toContain("benchmark-result-record-");
      expect(result.result.summary.baseline_arm_id).toBe(result.baseline_arm.benchmark_arm_id);
      expect(result.result.summary.candidate_arm_id).toBe(result.candidate_arm.benchmark_arm_id);
    });
  });

  it("rejects release monitors that are not bound to the compared manifests", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const baselineManifest = makeBaselineManifest();
      const candidateManifest = makeCandidateManifest();
      createBenchmarkArm(
        {
          benchmark_arm_id: "benchmark-arm-baseline",
          benchmark_suite_id: baselineManifest.benchmark_suite_id,
          manifest_id: baselineManifest.baseline_manifest_id,
          arm_kind: "baseline",
          mode: "offline_gold",
        },
        process.env,
      );
      createBenchmarkArm(
        {
          benchmark_arm_id: "benchmark-arm-candidate",
          benchmark_suite_id: candidateManifest.benchmark_suite_id,
          manifest_id: candidateManifest.candidate_manifest_id,
          arm_kind: "candidate",
          mode: "offline_gold",
        },
        process.env,
      );

      const baselinePath = path.join(dir, "baseline.json");
      const candidatePath = path.join(dir, "candidate.json");
      const benchmarkPath = path.join(dir, "benchmark.json");
      const verifierMetricsPath = path.join(dir, "verifier-metrics.json");
      const monitorPath = path.join(dir, "monitor.json");
      const componentRefPath = path.join(dir, "component-ref.json");
      const readinessPath = path.join(dir, "readiness.json");

      saveJsonFile(baselinePath, baselineManifest);
      saveJsonFile(candidatePath, candidateManifest);
      saveJsonFile(benchmarkPath, makeReleaseBenchmarkRecord());
      saveJsonFile(readinessPath, makeReadinessReport());
      seedGraderGovernance(
        candidateManifest.grader_set_version,
        candidateManifest.benchmark_suite_id,
      );
      saveJsonFile(verifierMetricsPath, {
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
      });
      saveJsonFile(
        monitorPath,
        createPromotedReleaseMonitorDefinition({
          promotedReleaseId: "other-release",
          baselineManifestId: "other-baseline",
          candidateManifestId: "other-candidate",
          requiredCaseKinds: ["atomic_case"],
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
      saveJsonFile(componentRefPath, materializeComponentRef());

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          benchmarkResultPaths: [benchmarkPath],
          verifierMetricsPath,
          monitorDefinitionPath: monitorPath,
          componentArtifactRefPaths: [componentRefPath],
          readinessReportPath: readinessPath,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Promoted monitor baseline_manifest_id"),
          expect.stringContaining("Promoted monitor candidate_manifest_id"),
        ]),
      );
    });
  });

  it("refuses benchmark execution when readiness is not_ready", async () => {
    const dir = await makeTempDir();
    const baselinePath = path.join(dir, "baseline.json");
    const candidatePath = path.join(dir, "candidate.json");
    const suitePath = path.join(dir, "suite.json");
    const baselineExecPath = path.join(dir, "baseline-exec.json");
    const candidateExecPath = path.join(dir, "candidate-exec.json");
    const readinessPath = path.join(dir, "readiness.json");

    saveJsonFile(baselinePath, makeBaselineManifest());
    saveJsonFile(candidatePath, makeCandidateManifest());
    saveJsonFile(suitePath, makeAtomicSuite());
    saveJsonFile(baselineExecPath, makeAtomicExecutionBundle(0.4));
    saveJsonFile(candidateExecPath, makeAtomicExecutionBundle(0.8));
    saveJsonFile(readinessPath, {
      ...makeReadinessReport("not_ready"),
      readiness_report_id: "repo-ci-specialist-readiness-blocked",
    });

    await expect(
      nicheBenchmarkCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          suitePath,
          baselineExecutionPath: baselineExecPath,
          candidateExecutionPath: candidateExecPath,
          readinessReportPath: readinessPath,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      ),
    ).rejects.toThrow(/not benchmarkable enough/i);
  });

  it("rejects release policy evaluation when grader governance artifacts are missing", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const baselinePath = path.join(dir, "baseline.json");
      const candidatePath = path.join(dir, "candidate.json");
      const benchmarkPath = path.join(dir, "benchmark.json");
      const verifierMetricsPath = path.join(dir, "verifier-metrics.json");
      const monitorPath = path.join(dir, "monitor.json");
      const componentRefPath = path.join(dir, "component-ref.json");
      const readinessPath = path.join(dir, "readiness.json");

      saveJsonFile(baselinePath, makeBaselineManifest());
      saveJsonFile(candidatePath, makeCandidateManifest());
      saveJsonFile(benchmarkPath, makeReleaseBenchmarkRecord());
      saveJsonFile(readinessPath, makeReadinessReport());
      saveJsonFile(verifierMetricsPath, {
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
      });
      saveJsonFile(
        monitorPath,
        createPromotedReleaseMonitorDefinition({
          promotedReleaseId: "repo-ci-release",
          baselineManifestId: "repo-ci-baseline",
          candidateManifestId: "repo-ci-candidate",
          requiredCaseKinds: ["atomic_case"],
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
      saveJsonFile(componentRefPath, materializeComponentRef());

      const result = await nicheReleaseCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          benchmarkResultPaths: [benchmarkPath],
          verifierMetricsPath,
          monitorDefinitionPath: monitorPath,
          componentArtifactRefPaths: [componentRefPath],
          readinessReportPath: readinessPath,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      );

      expect(result.promotion_controller.decision).toBe("rejected");
      expect(result.policy_evaluation.blocking_reasons).toEqual(
        expect.arrayContaining([expect.stringContaining("Missing grader set")]),
      );
    });
  });

  it("rejects compare inputs when stored benchmark arms target the wrong suite", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const baselineManifest = makeBaselineManifest();
      const candidateManifest = makeCandidateManifest();
      createBenchmarkArm(
        {
          benchmark_arm_id: "benchmark-arm-baseline",
          benchmark_suite_id: "other-suite",
          manifest_id: baselineManifest.baseline_manifest_id,
          arm_kind: "baseline",
          mode: "offline_gold",
        },
        process.env,
      );
      createBenchmarkArm(
        {
          benchmark_arm_id: "benchmark-arm-candidate",
          benchmark_suite_id: "other-suite",
          manifest_id: candidateManifest.candidate_manifest_id,
          arm_kind: "candidate",
          mode: "offline_gold",
        },
        process.env,
      );

      const baselinePath = path.join(dir, "baseline.json");
      const candidatePath = path.join(dir, "candidate.json");
      const benchmarkPath = path.join(dir, "benchmark.json");
      const verifierMetricsPath = path.join(dir, "verifier-metrics.json");
      const monitorPath = path.join(dir, "monitor.json");
      const readinessPath = path.join(dir, "readiness.json");

      saveJsonFile(baselinePath, baselineManifest);
      saveJsonFile(candidatePath, candidateManifest);
      saveJsonFile(benchmarkPath, makeReleaseBenchmarkRecord());
      saveJsonFile(readinessPath, makeReadinessReport());
      seedGraderGovernance(
        candidateManifest.grader_set_version,
        candidateManifest.benchmark_suite_id,
      );
      saveJsonFile(verifierMetricsPath, {
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
      });
      saveJsonFile(
        monitorPath,
        createPromotedReleaseMonitorDefinition({
          promotedReleaseId: "repo-ci-release",
          baselineManifestId: baselineManifest.baseline_manifest_id,
          candidateManifestId: candidateManifest.candidate_manifest_id,
          requiredCaseKinds: ["atomic_case"],
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

      const result = await nicheCompareCommand(
        {
          baselineManifestPath: baselinePath,
          candidateManifestPath: candidatePath,
          benchmarkResultPaths: [benchmarkPath],
          readinessReportPath: readinessPath,
          verifierMetricsPath,
          monitorDefinitionPath: monitorPath,
          latencyRegression: 0.05,
          costRegression: 0.04,
        },
        {
          log: () => {},
          error: () => {},
          exit: () => {},
        },
      );

      expect(result.release_policy?.recommended_decision).toBe("rejected");
      expect(result.release_policy?.blocking_reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining("baseline arm benchmark-arm-baseline targets suite other-suite"),
          expect.stringContaining(
            "candidate arm benchmark-arm-candidate targets suite other-suite",
          ),
        ]),
      );
    });
  });

  it("inspects promoted monitor definitions with cadence defaults instead of dropping metadata", async () => {
    const dir = await makeTempDir();
    const monitorPath = path.join(dir, "monitor.json");
    const definition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "repo-ci-release",
      baselineManifestId: "repo-ci-baseline",
      candidateManifestId: "repo-ci-candidate",
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
    });
    saveJsonFile(monitorPath, definition);

    const result = await nicheInspectCommand(
      {
        kind: "promoted_monitor",
        filePath: monitorPath,
      },
      {
        log: () => {},
        error: () => {},
        exit: () => {},
      },
    );

    expect(result.summary.cadence_defaults).toEqual(definition.cadence_defaults);
  });
});
