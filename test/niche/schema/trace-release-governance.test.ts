import AjvPkg from "ajv";
import { describe, expect, it } from "vitest";
import {
  ArbitrationArtifactSchema,
  CandidateRecipeSchema,
  CandidateReleaseSchema,
  GraderArtifactSchema,
  PromotedReleaseMonitorSchema,
  ReplayabilityStatusSchema,
  RewardArtifactSchema,
  RunTraceSchema,
  type RunTrace,
} from "../../../src/niche/schema/index.js";

const Ajv = AjvPkg as unknown as new (opts?: object) => import("ajv").default;
const ajv = new Ajv({ allErrors: true, strict: false });
const validateRunTrace = ajv.compile(RunTraceSchema);
const validateReplayabilityStatus = ajv.compile(ReplayabilityStatusSchema);
const validateCandidateRecipe = ajv.compile(CandidateRecipeSchema);
const validateCandidateRelease = ajv.compile(CandidateReleaseSchema);
const validatePromotedReleaseMonitor = ajv.compile(PromotedReleaseMonitorSchema);
const validateGraderArtifact = ajv.compile(GraderArtifactSchema);
const validateArbitrationArtifact = ajv.compile(ArbitrationArtifactSchema);
const validateRewardArtifact = ajv.compile(RewardArtifactSchema);

function makeArtifactRef() {
  return {
    artifact_id: "artifact-repo-dataset",
    artifact_type: "dataset",
    version: "2026.3.12",
    content_hash: "0123456789abcdef0123456789abcdef",
    rights_state: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: false,
      rights_to_generate_synthetic_from: true,
    },
    created_at: "2026-03-12T09:20:00.000Z",
  } as const;
}

function makeRunTrace(): RunTrace {
  return {
    trace_id: "trace-repo-ci-001",
    run_id: "run-repo-ci-001",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-specialist-pack",
    mode: "benchmark",
    session_ref: {
      session_id: "session-main",
      transcript_path: "agents/main/sessions/run-001.jsonl",
      route: "cli",
    },
    planner_inputs: [
      { stage_id: "planner-input-1", summary: "Benchmark prompt and repo context." },
    ],
    planner_outputs: [
      { stage_id: "planner-output-1", summary: "Plan to inspect build failure and patch." },
    ],
    action_proposals: [
      {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Need to reproduce the failure first.",
        guard_decision: "allowed",
        attempt_index: 0,
      },
    ],
    tool_calls: [
      {
        tool_call_id: "tool-call-1",
        tool_name: "exec",
        status: "completed",
        arguments_summary: "pnpm build:strict-smoke",
        output_summary: "Build failed before schema fix.",
      },
    ],
    observations: [
      {
        observation_id: "observation-1",
        source: "ci_logs",
        summary: "Build fails in schema export surface.",
      },
    ],
    verifier_decisions: [
      {
        decision_id: "verifier-1",
        outcome: "approved",
        rationale: "Output is grounded in build evidence.",
      },
    ],
    final_output: {
      output_id: "final-output-1",
      output_type: "text",
      content_summary: "Reported validated schema fix with evidence.",
      emitted_to_user: false,
    },
    usage: {
      input_tokens: 1200,
      output_tokens: 340,
      total_tokens: 1540,
    },
    latency: {
      planner_ms: 120,
      tool_ms: 1800,
      verifier_ms: 40,
      end_to_end_ms: 2100,
    },
    cost: {
      currency: "USD",
      total_cost: 0.12,
    },
    failure_labels: ["nonzero_exit"],
    artifact_refs: [makeArtifactRef()],
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    planner_version_id: "planner-primary-v1",
    action_policy_version_id: "repo-ci-action-policy-v1",
    verifier_pack_version_id: "repo-ci-verifier-pack-v1",
    retrieval_stack_version_id: "repo-ci-retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    source_access_manifest_id: "repo-ci-source-access",
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    evidence_bundle_refs: [
      {
        evidence_bundle_id: "evidence-bundle-1",
        source_refs: [{ source_id: "repo-root", source_hash_or_ref: "repo@abc123" }],
        retrieval_query: "build strict smoke schema exports",
        reranker_output: ["repo-root"],
        delivered_evidence: ["schema barrel export duplication"],
      },
    ],
    benchmark_arm_ref: {
      benchmark_arm_id: "candidate-arm",
    },
    benchmark_case_ref: {
      case_kind: "atomic_case",
      case_id: "eval-case-repo-search",
    },
    determinism_policy_id: "repo-ci-determinism-v1",
    random_seed: "seed-001",
    phase_timestamps: {
      planner_started_at: "2026-03-12T09:20:00.000Z",
      planner_finished_at: "2026-03-12T09:20:01.000Z",
      action_proposal_started_at: "2026-03-12T09:20:01.000Z",
      action_proposal_finished_at: "2026-03-12T09:20:02.000Z",
      tool_execution_started_at: "2026-03-12T09:20:02.000Z",
      tool_execution_finished_at: "2026-03-12T09:20:04.000Z",
      verifier_started_at: "2026-03-12T09:20:04.000Z",
      verifier_finished_at: "2026-03-12T09:20:05.000Z",
      final_emission_at: "2026-03-12T09:20:05.000Z",
      trace_persisted_at: "2026-03-12T09:20:06.000Z",
    },
    wall_clock_start_at: "2026-03-12T09:20:00.000Z",
    wall_clock_end_at: "2026-03-12T09:20:06.000Z",
    replayability_status: "replayable",
    determinism_notes: "Frozen repo snapshot and fixed benchmark seed.",
  };
}

describe("trace schema", () => {
  it("accepts replayable run traces with evidence and benchmark references", () => {
    expect(validateRunTrace(makeRunTrace())).toBe(true);
    expect(validateReplayabilityStatus("partially_replayable")).toBe(true);
  });

  it("round-trips a run trace through JSON serialization", () => {
    const roundTripped = JSON.parse(JSON.stringify(makeRunTrace())) as RunTrace;
    expect(validateRunTrace(roundTripped)).toBe(true);
  });
});

describe("release schemas", () => {
  it("accepts candidate recipes, releases, and promoted monitors", () => {
    const candidateRecipe = {
      candidate_recipe_id: "candidate-recipe-v1",
      niche_program_id: "repo-ci-specialist",
      created_at: "2026-03-12T09:25:00.000Z",
      recipe_type: "system_specialization",
      teacher_runtimes: ["openai:gpt-5"],
      input_dataset_refs: [makeArtifactRef()],
      synthesis_prompt_refs: [],
      distillation_steps: [],
      sidecar_training_steps: [
        {
          step_id: "sidecar-step-1",
          summary: "Train action policy from approved traces.",
          output_artifact_refs: [makeArtifactRef()],
        },
      ],
      verifier_training_steps: [],
      retrieval_optimization_steps: [],
      hyperparameters: {
        learning_rate: 0.01,
      },
      grader_refs: [makeArtifactRef()],
      evaluation_inputs: [makeArtifactRef()],
      promotion_inputs: [makeArtifactRef()],
    };

    expect(validateCandidateRecipe(candidateRecipe)).toBe(true);

    expect(
      validateCandidateRelease({
        candidate_release_id: "candidate-release-v1",
        niche_program_id: "repo-ci-specialist",
        baseline_release_id: "baseline-release-v1",
        stack_manifest: {
          baseline_manifest_id: "baseline-manifest-repo-ci",
          candidate_manifest_id: "candidate-manifest-repo-ci",
          component_artifact_refs: [makeArtifactRef()],
        },
        benchmark_results: [
          {
            benchmark_result_id: "result-1",
            benchmark_suite_id: "repo-ci-benchmark-suite",
            case_kind: "atomic_case",
            mode: "offline_gold",
            baseline_arm_id: "baseline-arm",
            candidate_arm_id: "candidate-arm",
            primary_metric: "task_success",
            case_count: 100,
            paired_delta_summary: {
              mean_delta: 0.12,
              median_delta: 0.1,
              p10_delta: 0.02,
              p90_delta: 0.2,
              confidence_interval_low: 0.03,
              confidence_interval_high: 0.18,
            },
            task_family_summaries: [
              {
                task_family: "repo_navigation",
                case_count: 50,
                score_mean: 0.9,
                hard_fail_rate: 0.02,
              },
            ],
            contamination_audit_summary: {
              contamination_detected: false,
              audited_case_count: 100,
            },
            invalidated: false,
            invalidation_reasons: [],
          },
        ],
        shadow_results: [],
        decision: "promoted",
        decision_reason: "Candidate clears benchmark thresholds without contamination.",
        approved_by: ["operator@example.com"],
        rollback_target: "baseline-release-v1",
      }),
    ).toBe(true);

    expect(
      validatePromotedReleaseMonitor({
        promoted_release_id: "candidate-release-v1",
        baseline_manifest_id: "baseline-manifest-repo-ci",
        candidate_manifest_id: "candidate-manifest-repo-ci",
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
          summary: "Recompile the domain pack when source freshness drops below threshold.",
        },
        rollback_policy: {
          policy_id: "rollback-v1",
          summary: "Rollback on sustained drift or critical hard-fail spikes.",
        },
      }),
    ).toBe(true);
  });
});

describe("governance schemas", () => {
  it("accepts grader, arbitration, and reward governance artifacts", () => {
    expect(
      validateGraderArtifact({
        grader_id: "grader-task-success",
        grader_type: "deterministic_rule",
        version: "2026.3.12",
        owner: "quality-team",
        calibration_suite_id: "grader-calibration-suite",
        prompt_or_rule_hash: "rule-hash-001",
        decision_schema: "binary-pass-fail",
        expected_failure_modes: ["false_positive", "false_negative"],
        created_at: "2026-03-12T09:30:00.000Z",
      }),
    ).toBe(true);

    expect(
      validateArbitrationArtifact({
        arbitration_policy_id: "arbitration-v1",
        grader_refs: [makeArtifactRef()],
        conflict_resolution_mode: "sme_required_on_conflict",
        sme_sampling_rate: 0.2,
        promotion_blocking_conflict_types: ["hard_fail_conflict"],
      }),
    ).toBe(true);

    expect(
      validateRewardArtifact({
        reward_artifact_id: "reward-v1",
        reward_type: "process_reward_model",
        version: "2026.3.12",
        training_inputs: [makeArtifactRef()],
        calibration_suite_id: "reward-calibration-suite",
        lineage_refs: [
          {
            parent_artifact_id: "artifact-repo-dataset",
            relationship: "derived_from",
            derivation_step: "reward_training",
            notes: "Reward calibrated from approved dataset lineage.",
          },
        ],
        owner: "quality-team",
        created_at: "2026-03-12T09:31:00.000Z",
      }),
    ).toBe(true);
  });
});
