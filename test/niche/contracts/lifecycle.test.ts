import AjvPkg from "ajv";
import { describe, expect, it } from "vitest";
import {
  ActionProposedEventSchema,
  BenchmarkCaseFinishedEventSchema,
  BenchmarkCaseStartedEventSchema,
  CandidatePromotedEventSchema,
  LifecycleEventSchema,
  LIFECYCLE_EVENT_TYPES,
  PlannerProposedEventSchema,
  RunTracePersistedEventSchema,
  VerifierDecisionEventSchema,
} from "../../../src/niche/contracts/lifecycle.js";

const Ajv = AjvPkg as unknown as new (opts?: object) => import("ajv").default;
const ajv = new Ajv({ allErrors: true, strict: false });
const validateLifecycleEvent = ajv.compile(LifecycleEventSchema);
const validatePlannerEvent = ajv.compile(PlannerProposedEventSchema);
const validateActionEvent = ajv.compile(ActionProposedEventSchema);
const validateVerifierEvent = ajv.compile(VerifierDecisionEventSchema);
const validateTracePersistedEvent = ajv.compile(RunTracePersistedEventSchema);
const validateBenchmarkStartedEvent = ajv.compile(BenchmarkCaseStartedEventSchema);
const validateBenchmarkFinishedEvent = ajv.compile(BenchmarkCaseFinishedEventSchema);
const validateCandidatePromotedEvent = ajv.compile(CandidatePromotedEventSchema);

describe("lifecycle events", () => {
  it("defines the full required event set", () => {
    expect(LIFECYCLE_EVENT_TYPES).toEqual([
      "planner_proposed",
      "action_proposed",
      "action_validated",
      "verifier_decision",
      "run_trace_persisted",
      "benchmark_case_started",
      "benchmark_case_finished",
      "candidate_promoted",
      "candidate_rolled_back",
    ]);
  });

  it("validates planner, action, verifier, and trace persistence envelopes", () => {
    const plannerEvent = {
      event_id: "event-1",
      event_type: "planner_proposed",
      occurred_at: "2026-03-12T10:30:00.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      baseline_manifest_id: "baseline-manifest-repo-ci",
      payload: {
        selected_manifest_id: "baseline-manifest-repo-ci",
        planner_runtime_component_id: "planner-primary",
        benchmark_suite_id: "repo-ci-benchmark-suite",
      },
    } as const;
    const actionEvent = {
      event_id: "event-2",
      event_type: "action_proposed",
      occurred_at: "2026-03-12T10:30:01.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        proposal_id: "proposal-1",
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        selected_tool: "exec",
        selected_reason: "Need to reproduce the failure first.",
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
    } as const;
    const verifierEvent = {
      event_id: "event-3",
      event_type: "verifier_decision",
      occurred_at: "2026-03-12T10:30:02.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        decision_id: "verifier-1",
        outcome: "approved",
        rationale: "Output is grounded in evidence.",
        findings: [],
      },
    } as const;
    const traceEvent = {
      event_id: "event-4",
      event_type: "run_trace_persisted",
      occurred_at: "2026-03-12T10:30:03.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        trace_id: "trace-1",
        replayability_status: "replayable",
        persisted_path: "state/niche/traces/trace-1.json",
      },
    } as const;

    expect(validatePlannerEvent(plannerEvent)).toBe(true);
    expect(validateActionEvent(actionEvent)).toBe(true);
    expect(validateVerifierEvent(verifierEvent)).toBe(true);
    expect(validateTracePersistedEvent(traceEvent)).toBe(true);
    expect(validateLifecycleEvent(plannerEvent)).toBe(true);
    expect(validateLifecycleEvent(actionEvent)).toBe(true);
    expect(validateLifecycleEvent(verifierEvent)).toBe(true);
    expect(validateLifecycleEvent(traceEvent)).toBe(true);
  });

  it("validates benchmark start/finish and candidate promotion payloads", () => {
    const benchmarkStarted = {
      event_id: "event-5",
      event_type: "benchmark_case_started",
      occurred_at: "2026-03-12T10:30:04.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        benchmark_arm_id: "candidate-arm",
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: "eval-case-1",
        },
      },
    } as const;
    const benchmarkFinished = {
      event_id: "event-6",
      event_type: "benchmark_case_finished",
      occurred_at: "2026-03-12T10:30:05.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        benchmark_arm_id: "candidate-arm",
        benchmark_case_ref: {
          case_kind: "atomic_case",
          case_id: "eval-case-1",
        },
        invalidated: false,
        outcome_summary: "Candidate completed the benchmark case successfully.",
      },
    } as const;
    const candidatePromoted = {
      event_id: "event-7",
      event_type: "candidate_promoted",
      occurred_at: "2026-03-12T10:30:06.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      baseline_manifest_id: "baseline-manifest-repo-ci",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        candidate_release_id: "candidate-release-v1",
        rollback_target: "baseline-release-v1",
      },
    } as const;

    expect(validateBenchmarkStartedEvent(benchmarkStarted)).toBe(true);
    expect(validateBenchmarkFinishedEvent(benchmarkFinished)).toBe(true);
    expect(validateCandidatePromotedEvent(candidatePromoted)).toBe(true);
    expect(validateLifecycleEvent(benchmarkStarted)).toBe(true);
    expect(validateLifecycleEvent(benchmarkFinished)).toBe(true);
    expect(validateLifecycleEvent(candidatePromoted)).toBe(true);
  });

  it("round-trips lifecycle events through JSON serialization", () => {
    const event = {
      event_id: "event-8",
      event_type: "candidate_promoted",
      occurred_at: "2026-03-12T10:30:07.000Z",
      run_id: "run-1",
      niche_program_id: "repo-ci-specialist",
      baseline_manifest_id: "baseline-manifest-repo-ci",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        candidate_release_id: "candidate-release-v1",
        rollback_target: "baseline-release-v1",
      },
    } as const;

    expect(validateLifecycleEvent(JSON.parse(JSON.stringify(event)))).toBe(true);
  });
});
