import { describe, expect, it } from "vitest";
import {
  bootstrapConfidenceInterval,
  buildPairedDeltaSummary,
  computePairedDeltas,
  createAtomicBenchmarkSuite,
  createBenchmarkArm,
  getAtomicBenchmarkSuite,
  getBenchmarkArm,
  listAtomicBenchmarkSuites,
  listBenchmarkArms,
  runAtomicBenchmark,
} from "../../../src/niche/benchmark/index.js";
import type {
  BaselineManifest,
  CandidateManifest,
  EvalCase,
} from "../../../src/niche/schema/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeSuite() {
  return {
    metadata: {
      benchmark_suite_id: "repo-ci-atomic-suite",
      case_kind: "atomic_case",
      mode: "offline_gold",
      split: "gold_eval",
      created_at: "2026-03-12T11:00:00.000Z",
      suite_version: "2026.3.12",
      suite_hash: "0123456789abcdef0123456789abcdef",
      fixture_version: "2026.3.12-fixtures",
      determinism_policy_id: "determinism-v1",
      task_families: ["repo_navigation", "ci_repair"],
      description: "Atomic repo/CI benchmark suite.",
    },
    cases: [
      {
        eval_case_id: "eval-case-1",
        suite_id: "repo-ci-atomic-suite",
        split: "gold_eval",
        task_family: "repo_navigation",
        input: { prompt: "Find the runtime entrypoint." },
        allowed_tools: ["read", "exec"],
        allowed_sources: ["repo-root"],
        grader_spec: {
          grader_refs: ["grader-task-success"],
          primary_metric: "task_success",
        },
        pass_conditions: ["correct_entrypoint"],
        hard_fail_conditions: ["hallucinated_paths"],
        difficulty: 1,
        seed: "seed-1",
      },
      {
        eval_case_id: "eval-case-2",
        suite_id: "repo-ci-atomic-suite",
        split: "gold_eval",
        task_family: "ci_repair",
        input: { prompt: "Reproduce the failing build." },
        allowed_tools: ["read", "exec", "apply_patch"],
        allowed_sources: ["repo-root", "ci-logs"],
        grader_spec: {
          grader_refs: ["grader-task-success"],
          primary_metric: "task_success",
        },
        pass_conditions: ["correct_failure_root_cause"],
        hard_fail_conditions: ["unsafe_command_use"],
        difficulty: 2,
        seed: "seed-2",
      },
    ] satisfies EvalCase[],
  } as const;
}

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T10:00:00.000Z",
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
    capability_snapshot_at: "2026-03-12T09:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned baseline provider metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-baseline",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-atomic-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Baseline manifest.",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read", "exec", "apply_patch"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "baseline" },
    verifier_config: { verifier_pack: "baseline" },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T10:01:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Candidate keeps the same planner runtime family.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T09:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "release_label_only",
    provider_runtime_notes: "Candidate metadata is provider-visible but not exact snapshot.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-atomic-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Candidate manifest.",
    domain_pack_id: "repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read", "exec", "apply_patch"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { retrieval_policy: "baseline" },
    verifier_config: { verifier_pack: "baseline" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeBenchmarkArm(params: { armKind: "baseline" | "candidate"; manifestId: string }) {
  return {
    benchmark_arm_id: `benchmark-arm-${params.armKind}`,
    benchmark_suite_id: "repo-ci-atomic-suite",
    manifest_id: params.manifestId,
    arm_kind: params.armKind,
    mode: "offline_gold" as const,
  };
}

describe("suite registry", () => {
  it("creates, loads, and lists atomic suites and benchmark arms", async () => {
    await withTempHome(async () => {
      const suite = makeSuite();
      const baselineArm = {
        benchmark_arm_id: "baseline-arm",
        benchmark_suite_id: "repo-ci-atomic-suite",
        manifest_id: "baseline-manifest-repo-ci",
        arm_kind: "baseline",
        mode: "offline_gold",
      } as const;
      const candidateArm = {
        benchmark_arm_id: "candidate-arm",
        benchmark_suite_id: "repo-ci-atomic-suite",
        manifest_id: "candidate-manifest-repo-ci",
        arm_kind: "candidate",
        mode: "offline_gold",
      } as const;

      createAtomicBenchmarkSuite(suite, process.env);
      createBenchmarkArm(baselineArm, process.env);
      createBenchmarkArm(candidateArm, process.env);

      expect(getAtomicBenchmarkSuite("repo-ci-atomic-suite", process.env)).toEqual(suite);
      expect(listAtomicBenchmarkSuites(process.env)).toEqual([suite]);
      expect(getBenchmarkArm("baseline-arm", process.env)).toEqual(baselineArm);
      expect(listBenchmarkArms({ benchmarkSuiteId: "repo-ci-atomic-suite" }, process.env)).toEqual([
        baselineArm,
        candidateArm,
      ]);
    });
  });
});

describe("statistics helpers", () => {
  it("computes deterministic paired deltas and bootstrap summaries", () => {
    const deltas = computePairedDeltas([
      { baseline: 0.5, candidate: 0.7 },
      { baseline: 0.2, candidate: 0.6 },
      { baseline: 0.4, candidate: 0.3 },
    ]);
    const summary = buildPairedDeltaSummary(deltas, { seed: 7, iterations: 200 });
    const repeatedSummary = buildPairedDeltaSummary(deltas, { seed: 7, iterations: 200 });
    const interval = bootstrapConfidenceInterval(deltas, { seed: 7, iterations: 200 });

    expect(deltas).toEqual([0.19999999999999996, 0.39999999999999997, -0.10000000000000003]);
    expect(summary).toEqual(repeatedSummary);
    expect(summary.meanDelta).toBeCloseTo(0.16666666666666663);
    expect(summary.medianDelta).toBeCloseTo(0.19999999999999996);
    expect(summary.p10Delta).toBeCloseTo(-0.04);
    expect(summary.p90Delta).toBeCloseTo(0.36);
    expect(summary.confidenceIntervalLow).toBeLessThanOrEqual(summary.meanDelta);
    expect(summary.confidenceIntervalHigh).toBeGreaterThanOrEqual(summary.meanDelta);
    expect(interval).toEqual({
      low: summary.confidenceIntervalLow,
      high: summary.confidenceIntervalHigh,
    });
  });
});

describe("atomic benchmark runner", () => {
  it("runs paired cases, includes contamination audit metadata, and surfaces provider metadata quality", async () => {
    const suite = makeSuite();
    const baselineManifest = makeBaselineManifest();
    const candidateManifest = makeCandidateManifest();
    const baselineArm = makeBenchmarkArm({
      armKind: "baseline",
      manifestId: baselineManifest.baseline_manifest_id,
    });
    const candidateArm = makeBenchmarkArm({
      armKind: "candidate",
      manifestId: candidateManifest.candidate_manifest_id,
    });

    const result = await runAtomicBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm,
      candidateArm,
      bootstrapSeed: 11,
      contaminationDetected: false,
      actualSuiteHash: suite.metadata.suite_hash,
      actualFixtureVersion: suite.metadata.fixture_version,
      actualGraderVersion: suite.cases[0].grader_spec.grader_refs[0],
      executeBaselineCase: async ({ evalCase }) => ({
        score: evalCase.eval_case_id === "eval-case-1" ? 0.5 : 0.4,
        hard_fail: false,
        latency_ms: 100,
        cost: 0.01,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      }),
      executeCandidateCase: async ({ evalCase }) => ({
        score: evalCase.eval_case_id === "eval-case-1" ? 0.8 : 0.7,
        hard_fail: false,
        latency_ms: 110,
        cost: 0.02,
        verifier_outcome: "approved",
        grader_version: "grader-v1",
      }),
    });

    expect(result.paired_case_results).toHaveLength(2);
    expect(result.summary.invalidated).toBe(false);
    expect(result.summary.baseline_arm_id).toBe("benchmark-arm-baseline");
    expect(result.summary.candidate_arm_id).toBe("benchmark-arm-candidate");
    expect(result.summary.baseline_provider_metadata_quality).toBe("exact_snapshot");
    expect(result.summary.candidate_provider_metadata_quality).toBe("release_label_only");
    expect(result.summary.contamination_audit_summary.contamination_detected).toBe(false);
    expect(result.contamination_audit_metadata.audited_case_count).toBe(2);
    expect(result.summary.task_family_summaries[0]?.mean_delta).toBeGreaterThan(0);
    expect(result.summary.paired_delta_summary.confidence_interval_low).toBeLessThanOrEqual(
      result.summary.paired_delta_summary.confidence_interval_high,
    );
  });

  it("invalidates incompatible manifest comparisons instead of pretending to score them", async () => {
    const suite = makeSuite();
    const baselineManifest = makeBaselineManifest();
    const candidateManifest = {
      ...makeCandidateManifest(),
      benchmark_suite_id: "other-suite",
      provider: "anthropic",
      model_id: "claude-sonnet",
    };
    const baselineArm = makeBenchmarkArm({
      armKind: "baseline",
      manifestId: baselineManifest.baseline_manifest_id,
    });
    const candidateArm = makeBenchmarkArm({
      armKind: "candidate",
      manifestId: candidateManifest.candidate_manifest_id,
    });

    const result = await runAtomicBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm,
      candidateArm,
      contaminationDetected: false,
      actualSuiteHash: suite.metadata.suite_hash,
      actualFixtureVersion: suite.metadata.fixture_version,
      actualGraderVersion: suite.cases[0].grader_spec.grader_refs[0],
      executeBaselineCase: async () => {
        throw new Error("baseline executor should not run for invalidated comparisons");
      },
      executeCandidateCase: async () => {
        throw new Error("candidate executor should not run for invalidated comparisons");
      },
    });

    expect(result.summary.invalidated).toBe(true);
    expect(result.paired_case_results).toEqual([]);
    expect(result.summary.task_family_summaries).toHaveLength(2);
    expect(result.summary.invalidation_reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining("same benchmark_suite_id"),
        expect.stringContaining("same provider"),
      ]),
    );
  });

  it("invalidates atomic runs for contamination and drift before executing any cases", async () => {
    const suite = makeSuite();
    const baselineManifest = makeBaselineManifest();
    const candidateManifest = makeCandidateManifest();
    const baselineArm = makeBenchmarkArm({
      armKind: "baseline",
      manifestId: baselineManifest.baseline_manifest_id,
    });
    const candidateArm = makeBenchmarkArm({
      armKind: "candidate",
      manifestId: candidateManifest.candidate_manifest_id,
    });

    const result = await runAtomicBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm,
      candidateArm,
      contaminationDetected: true,
      actualSuiteHash: "different-suite-hash",
      actualFixtureVersion: "different-fixtures",
      actualGraderVersion: "different-grader",
      executeBaselineCase: async () => {
        throw new Error("baseline executor should not run when atomic benchmark is invalidated");
      },
      executeCandidateCase: async () => {
        throw new Error("candidate executor should not run when atomic benchmark is invalidated");
      },
    });

    expect(result.summary.invalidated).toBe(true);
    expect(result.contamination_audit_metadata.contamination_detected).toBe(true);
    expect(result.invalidation_reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "contamination_detected",
        "benchmark_suite_hash_drift",
        "fixture_version_drift",
        "grader_version_drift",
      ]),
    );
  });

  it("marks contamination when contaminationDetected is true", async () => {
    const suite = makeSuite();
    const baselineManifest = makeBaselineManifest();
    const candidateManifest = makeCandidateManifest();
    const baselineArm = makeBenchmarkArm({
      armKind: "baseline",
      manifestId: baselineManifest.baseline_manifest_id,
    });
    const candidateArm = makeBenchmarkArm({
      armKind: "candidate",
      manifestId: candidateManifest.candidate_manifest_id,
    });

    const result = await runAtomicBenchmark({
      suite,
      baselineManifest,
      candidateManifest,
      baselineArm,
      candidateArm,
      contaminationDetected: true,
      actualSuiteHash: suite.metadata.suite_hash,
      actualFixtureVersion: suite.metadata.fixture_version,
      actualGraderVersion: suite.cases[0].grader_spec.grader_refs[0],
      executeBaselineCase: async () => {
        throw new Error("should not execute when contamination is detected");
      },
      executeCandidateCase: async () => {
        throw new Error("should not execute when contamination is detected");
      },
    });

    expect(result.summary.invalidated).toBe(true);
    expect(result.summary.invalidation_reasons).toContainEqual(
      expect.stringContaining("contaminated"),
    );
    expect(result.invalidation_reasons).toContainEqual(
      expect.objectContaining({ code: "contamination_detected" }),
    );
  });
});
