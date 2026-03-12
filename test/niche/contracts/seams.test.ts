import AjvPkg from "ajv";
import { describe, expect, it } from "vitest";
import {
  ActionSeamContractSchema,
  PlannerSeamContractSchema,
  TraceSeamContractSchema,
  VerifierSeamContractSchema,
  actionSeamHasStructuredProposal,
  plannerSeamHasManifestBinding,
  traceSeamHasBenchmarkContext,
} from "../../../src/niche/contracts/seams.js";

const Ajv = AjvPkg as unknown as new (opts?: object) => import("ajv").default;
const ajv = new Ajv({ allErrors: true, strict: false });
const validatePlannerSeam = ajv.compile(PlannerSeamContractSchema);
const validateActionSeam = ajv.compile(ActionSeamContractSchema);
const validateVerifierSeam = ajv.compile(VerifierSeamContractSchema);
const validateTraceSeam = ajv.compile(TraceSeamContractSchema);

describe("planner seam contract", () => {
  it("requires manifest-bound run metadata", () => {
    const plannerSeam = {
      seam: "planner",
      input: {
        run_id: "run-1",
        session_id: "session-main",
        niche_program_id: "repo-ci-specialist",
        baseline_manifest_id: "baseline-manifest-repo-ci",
        source_access_manifest_id: "repo-ci-source-access",
        planner_runtime_component_id: "planner-primary",
      },
      output: {
        selected_manifest_id: "baseline-manifest-repo-ci",
        run_mode: "baseline",
        planner_context_summary: "Selected the baseline control arm.",
      },
    } as const;

    expect(validatePlannerSeam(plannerSeam)).toBe(true);
    expect(plannerSeamHasManifestBinding(plannerSeam.input)).toBe(true);

    expect(
      plannerSeamHasManifestBinding({
        ...plannerSeam.input,
        baseline_manifest_id: undefined,
      }),
    ).toBe(false);
  });
});

describe("action seam contract", () => {
  it("requires a structured proposal before execution", () => {
    const actionSeam = {
      seam: "action",
      input: {
        proposal_id: "proposal-1",
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        selected_tool: "exec",
        selected_reason: "Reproduce the failing build first.",
        guard_decision: "allowed",
        selector_score: 0.99,
        candidate_rankings: [
          {
            tool_name: "exec",
            score: 0.99,
            reason: "Only tool that can reproduce the failure.",
          },
        ],
        attempt_index: 0,
      },
      output: {
        tool_call_id: "tool-call-1",
        ready_for_execution: true,
        repair_requested: false,
        execution_summary: "Ready to invoke the tool.",
      },
    } as const;

    expect(validateActionSeam(actionSeam)).toBe(true);
    expect(actionSeamHasStructuredProposal(actionSeam.input)).toBe(true);
    expect(
      validateActionSeam({
        ...actionSeam,
        input: {
          ...actionSeam.input,
          candidate_rankings: [],
        },
      }),
    ).toBe(false);
  });
});

describe("verifier seam contract", () => {
  it("supports approve, repair, escalate, and veto outcomes explicitly", () => {
    const verifierSeam = {
      seam: "verifier",
      input: {
        run_id: "run-1",
        candidate_output_summary: "Reported the failing export surface and fix.",
        verifier_pack_version_id: "verifier-pack-v1",
        source_access_manifest_id: "repo-ci-source-access",
        evidence_bundle_refs: [
          {
            evidence_bundle_id: "evidence-bundle-1",
            source_refs: [{ source_id: "repo-root", source_hash_or_ref: "repo@abc123" }],
            retrieval_query: "schema export duplication",
            reranker_output: ["repo-root"],
            delivered_evidence: ["export duplication"],
          },
        ],
      },
      output: {
        decision_id: "verifier-1",
        outcome: "vetoed",
        rationale: "Candidate output omitted the manifest-bound evidence path.",
        findings: [
          {
            finding_id: "finding-1",
            severity: "high",
            message: "Missing required evidence citation.",
          },
        ],
      },
    } as const;

    expect(validateVerifierSeam(verifierSeam)).toBe(true);
  });
});

describe("trace seam contract", () => {
  it("requires benchmark-ready persistence payloads when in benchmark mode", () => {
    const traceSeam = {
      seam: "trace",
      input: {
        trace_id: "trace-1",
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        domain_pack_id: "repo-ci-pack",
        mode: "benchmark",
        session_ref: {
          session_id: "session-main",
        },
        planner_inputs: [{ stage_id: "planner-input-1", summary: "Benchmark prompt." }],
        planner_outputs: [{ stage_id: "planner-output-1", summary: "Plan to inspect build." }],
        action_proposals: [
          {
            proposal_id: "proposal-1",
            selected_tool: "exec",
            selected_reason: "Need to reproduce the failure.",
          },
        ],
        tool_calls: [
          {
            tool_call_id: "tool-call-1",
            tool_name: "exec",
            status: "completed",
          },
        ],
        observations: [
          {
            observation_id: "observation-1",
            source: "ci_logs",
            summary: "Build failure observed.",
          },
        ],
        verifier_decisions: [
          {
            decision_id: "verifier-1",
            outcome: "approved",
            rationale: "Output is grounded.",
          },
        ],
        final_output: {
          output_id: "output-1",
          output_type: "text",
          content_summary: "Reported build issue.",
          emitted_to_user: false,
        },
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
        latency: {
          planner_ms: 1,
          tool_ms: 2,
          verifier_ms: 1,
          end_to_end_ms: 4,
        },
        cost: {
          currency: "USD",
          total_cost: 0.01,
        },
        failure_labels: [],
        artifact_refs: [
          {
            artifact_id: "artifact-1",
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
            created_at: "2026-03-12T10:00:00.000Z",
          },
        ],
        baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
        planner_version_id: "planner-primary-v1",
        action_policy_version_id: "action-policy-v1",
        verifier_pack_version_id: "verifier-pack-v1",
        retrieval_stack_version_id: "retrieval-stack-v1",
        grader_set_version_id: "grader-set-v1",
        source_access_manifest_id: "repo-ci-source-access",
        runtime_snapshot_id: "runtime-snapshot-v1",
        context_bundle_id: "context-bundle-v1",
        evidence_bundle_refs: [
          {
            evidence_bundle_id: "evidence-bundle-1",
            source_refs: [{ source_id: "repo-root", source_hash_or_ref: "repo@abc123" }],
            retrieval_query: "schema export duplication",
            reranker_output: ["repo-root"],
            delivered_evidence: ["export duplication"],
          },
        ],
        benchmark_arm_ref: {
          benchmark_arm_id: "candidate-arm",
        },
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: "eval-case-1",
        },
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-1",
        phase_timestamps: {
          planner_started_at: "2026-03-12T10:00:00.000Z",
          planner_finished_at: "2026-03-12T10:00:01.000Z",
          action_proposal_started_at: "2026-03-12T10:00:01.000Z",
          action_proposal_finished_at: "2026-03-12T10:00:02.000Z",
          tool_execution_started_at: "2026-03-12T10:00:02.000Z",
          tool_execution_finished_at: "2026-03-12T10:00:03.000Z",
          verifier_started_at: "2026-03-12T10:00:03.000Z",
          verifier_finished_at: "2026-03-12T10:00:04.000Z",
          final_emission_at: "2026-03-12T10:00:04.000Z",
          trace_persisted_at: "2026-03-12T10:00:05.000Z",
        },
        wall_clock_start_at: "2026-03-12T10:00:00.000Z",
        wall_clock_end_at: "2026-03-12T10:00:05.000Z",
        replayability_status: "replayable",
        determinism_notes: "Benchmark trace preserved full replay context.",
      },
      output: {
        persisted_trace_id: "trace-1",
        persisted_path: "state/niche/traces/trace-1.json",
        replayability_status: "replayable",
        artifact_ref_count: 1,
      },
    } as const;

    expect(validateTraceSeam(traceSeam)).toBe(true);
    expect(traceSeamHasBenchmarkContext(traceSeam.input)).toBe(true);
    expect(
      traceSeamHasBenchmarkContext({
        ...traceSeam.input,
        benchmark_case_ref: undefined,
      }),
    ).toBe(false);
  });
});
