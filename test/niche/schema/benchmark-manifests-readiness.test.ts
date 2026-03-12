import AjvPkg from "ajv";
import { describe, expect, it } from "vitest";
import {
  areManifestsBenchmarkComparable,
  BaselineManifestSchema,
  BenchmarkResultSummarySchema,
  CandidateManifestSchema,
  DeterminismRuntimePolicySchema,
  EpisodeCaseSchema,
  EvalCaseSchema,
  hasReadinessHardBlockers,
  isReadyForSpecialization,
  ReadinessReportSchema,
  SourceAccessManifestSchema,
  type BaselineManifest,
  type CandidateManifest,
  type ReadinessReport,
} from "../../../src/niche/schema/index.js";

const Ajv = AjvPkg as unknown as new (opts?: object) => import("ajv").default;
const ajv = new Ajv({ allErrors: true, strict: false });
const validateEvalCase = ajv.compile(EvalCaseSchema);
const validateEpisodeCase = ajv.compile(EpisodeCaseSchema);
const validateDeterminismPolicy = ajv.compile(DeterminismRuntimePolicySchema);
const validateSourceAccessManifest = ajv.compile(SourceAccessManifestSchema);
const validateBaselineManifest = ajv.compile(BaselineManifestSchema);
const validateCandidateManifest = ajv.compile(CandidateManifestSchema);
const validateBenchmarkResultSummary = ajv.compile(BenchmarkResultSummarySchema);
const validateReadinessReport = ajv.compile(ReadinessReportSchema);

function makeSourceAccessManifest() {
  return {
    source_access_manifest_id: "repo-ci-source-access",
    allowed_tools: ["read", "exec", "apply_patch"],
    allowed_retrieval_indices: ["repo-index"],
    allowed_live_sources: ["ci-logs-live"],
    disallowed_sources: ["gold-eval-corpus"],
    sandbox_policy: "workspace_write",
    network_policy: "restricted",
    approval_policy: "operator_gated",
  };
}

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T09:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Baseline planner runtime for same-model comparison.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T08:55:00.000Z",
    routing_proxy_version: "2026.3.10",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned direct-provider runtime.",
    sampling_config: {
      temperature: 0.2,
      top_p: 1,
    },
    prompt_asset_version: "2026.3.12-baseline",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-benchmark-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: {
      max_attempts: 1,
      backoff_policy: "none",
      retry_on: ["transient_tool_error"],
    },
    token_budget: {
      max_input_tokens: 64000,
      max_output_tokens: 8192,
      max_total_tokens: 72000,
    },
    context_budget: {
      max_context_tokens: 64000,
      max_retrieval_items: 8,
      max_exemplars: 3,
    },
    execution_mode: "benchmark",
    notes: "OpenClaw control arm for repo/terminal/CI evaluation.",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read", "exec", "apply_patch"],
    tool_contract_version: "2026.3.12",
    retrieval_config: {
      retrieval_policy: "baseline",
    },
    verifier_config: {
      verifier_pack: "baseline",
    },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T09:05:00.000Z",
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
    capability_snapshot_at: "2026-03-12T08:55:00.000Z",
    routing_proxy_version: "2026.3.10",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Same provider metadata as the control arm.",
    sampling_config: {
      temperature: 0.2,
      top_p: 1,
    },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-benchmark-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: {
      max_attempts: 1,
      backoff_policy: "none",
      retry_on: ["transient_tool_error"],
    },
    token_budget: {
      max_input_tokens: 64000,
      max_output_tokens: 8192,
      max_total_tokens: 72000,
    },
    context_budget: {
      max_context_tokens: 64000,
      max_retrieval_items: 8,
      max_exemplars: 3,
    },
    execution_mode: "benchmark",
    notes: "NicheClaw candidate arm for repo/terminal/CI evaluation.",
    domain_pack_id: "repo-ci-specialist-pack",
    action_policy_id: "repo-ci-action-policy-v1",
    retrieval_stack_id: "repo-ci-retrieval-stack-v1",
    verifier_pack_id: "repo-ci-verifier-pack-v1",
    optional_student_model_ids: [],
    candidate_recipe: "repo-ci-candidate-recipe-v1",
  };
}

function makeReadinessReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    readiness_report_id: "repo-ci-readiness",
    niche_program_id: "repo-ci-specialist",
    status: "ready_with_warnings",
    dimension_scores: {
      source_quality: { score: 92, rationale: "Primary repo and CI logs are clean and current." },
      source_coverage: { score: 88, rationale: "Coverage spans code, tests, and CI signals." },
      contradiction_rate: { score: 8, rationale: "Low contradiction rate after source review." },
      freshness: { score: 90, rationale: "Sources come from the active workspace and latest CI." },
      rights_sufficiency: {
        score: 95,
        rationale: "Operator-managed sources permit storage and benchmarking.",
      },
      task_observability: { score: 94, rationale: "Tool execution and outcomes are observable." },
      benchmarkability: { score: 93, rationale: "The niche supports held-out paired tasks." },
      measurable_success_criteria: {
        score: 89,
        rationale: "Task success and hard-fail rate are measurable.",
      },
      tool_availability: {
        score: 91,
        rationale: "Required repo and terminal tools are available.",
      },
    },
    hard_blockers: [],
    warnings: [
      {
        warning_code: "live_trace_embargo_required",
        message: "Live traces must remain embargoed before training reuse.",
      },
    ],
    recommended_next_actions: [
      {
        action_id: "review_embargo_policy",
        summary: "Confirm the live-trace embargo window before optimization starts.",
        priority: "recommended",
      },
    ],
    generated_at: "2026-03-12T09:10:00.000Z",
    ...overrides,
  };
}

describe("benchmark schemas", () => {
  it("accepts atomic and episode benchmark cases plus determinism policy", () => {
    expect(
      validateEvalCase({
        eval_case_id: "eval-case-repo-search",
        suite_id: "repo-ci-benchmark-suite",
        split: "gold_eval",
        task_family: "repo_navigation",
        input: {
          prompt: "Find the agent entrypoint and the seam where runtime execution begins.",
        },
        allowed_tools: ["read", "exec"],
        allowed_sources: ["repo-root", "ci-logs"],
        grader_spec: {
          grader_refs: ["grader-task-success"],
          primary_metric: "task_success",
          notes: "Rule-first grading for deterministic repo tasks.",
        },
        pass_conditions: ["correct_entrypoint", "correct_runtime_seam"],
        hard_fail_conditions: ["hallucinated_file_paths"],
        difficulty: 2,
        seed: "repo-search-gold-001",
      }),
    ).toBe(true);

    expect(
      validateEpisodeCase({
        episode_case_id: "episode-case-ci-repair",
        suite_id: "repo-ci-benchmark-suite",
        split: "hidden_eval",
        task_family: "ci_repair",
        initial_state: {
          branch: "feature/failing-build",
          failing_command: "pnpm build:strict-smoke",
        },
        allowed_tools: ["read", "exec", "apply_patch"],
        allowed_sources: ["repo-root", "ci-logs"],
        step_constraints: ["no_unapproved_network", "scoped_patch_only"],
        termination_conditions: ["build_passes", "operator_escalation"],
        grader_spec: {
          grader_refs: ["grader-task-success", "grader-hard-fail"],
          primary_metric: "task_success",
        },
        hard_fail_conditions: ["benchmark_leakage", "unsafe_command_use"],
        difficulty: 4,
        seed: "ci-repair-episode-001",
      }),
    ).toBe(true);

    expect(
      validateDeterminismPolicy({
        determinism_policy_id: "repo-ci-determinism-v1",
        source_mode: "frozen",
        cache_mode: "fixed_snapshot",
        clock_mode: "time_frozen",
        network_mode: "restricted",
        seed_policy: "record_per_case",
        environment_snapshot_policy: "capture_workspace_and_fixture_versions",
      }),
    ).toBe(true);
  });

  it("accepts benchmark result summaries that surface contamination and paired deltas", () => {
    expect(
      validateBenchmarkResultSummary({
        benchmark_result_id: "repo-ci-gold-summary",
        benchmark_suite_id: "repo-ci-benchmark-suite",
        case_kind: "atomic_case",
        mode: "offline_gold",
        baseline_arm_id: "baseline-arm",
        candidate_arm_id: "candidate-arm",
        provider_metadata_quality: "exact_snapshot",
        primary_metric: "task_success",
        case_count: 120,
        paired_delta_summary: {
          mean_delta: 0.17,
          median_delta: 0.14,
          p10_delta: 0.03,
          p90_delta: 0.29,
          confidence_interval_low: 0.05,
          confidence_interval_high: 0.27,
        },
        task_family_summaries: [
          {
            task_family: "repo_navigation",
            case_count: 60,
            score_mean: 0.92,
            hard_fail_rate: 0.01,
          },
        ],
        contamination_audit_summary: {
          contamination_detected: false,
          audited_case_count: 120,
          notes: "No benchmark leakage detected.",
        },
        invalidated: false,
        invalidation_reasons: [],
      }),
    ).toBe(true);
  });
});

describe("manifest schemas", () => {
  it("accepts source access, baseline, and candidate manifests", () => {
    expect(validateSourceAccessManifest(makeSourceAccessManifest())).toBe(true);
    expect(validateBaselineManifest(makeBaselineManifest())).toBe(true);
    expect(validateCandidateManifest(makeCandidateManifest())).toBe(true);
  });

  it("enforces benchmark comparison invariants for same-model comparisons", () => {
    const baseline = makeBaselineManifest();
    const candidate = makeCandidateManifest();

    expect(areManifestsBenchmarkComparable(baseline, candidate)).toBe(true);

    const mismatchedCandidate = {
      ...candidate,
      benchmark_suite_id: "different-suite",
      source_access_manifest_id: "different-source-access",
      provider: "anthropic",
      model_id: "claude-sonnet",
    };

    expect(areManifestsBenchmarkComparable(baseline, mismatchedCandidate)).toBe(false);
  });
});

describe("readiness schema", () => {
  it("accepts a readiness report and encodes blocking semantics via helper functions", () => {
    const report = makeReadinessReport();

    expect(validateReadinessReport(report)).toBe(true);
    expect(hasReadinessHardBlockers(report)).toBe(false);
    expect(isReadyForSpecialization(report)).toBe(true);
  });

  it("treats hard blockers as not ready for specialization", () => {
    const blockedReport = makeReadinessReport({
      status: "not_ready",
      hard_blockers: [
        {
          blocker_code: "insufficient_rights_to_use",
          message: "Training and benchmarking rights are not sufficient for the declared sources.",
        },
      ],
      warnings: [],
      recommended_next_actions: [
        {
          action_id: "resolve_rights_gap",
          summary: "Acquire explicit operator authorization for training and benchmark reuse.",
          priority: "required",
        },
      ],
    });

    expect(validateReadinessReport(blockedReport)).toBe(true);
    expect(hasReadinessHardBlockers(blockedReport)).toBe(true);
    expect(isReadyForSpecialization(blockedReport)).toBe(false);
  });
});
