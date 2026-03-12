import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { BenchmarkCaseKindSchema } from "./benchmark.js";
import { IdentifierString, NonEmptyString, TimestampString, stringEnum } from "./common.js";
import { ArtifactRefSchema } from "./release.js";

export const RUN_TRACE_MODES = ["baseline", "candidate", "shadow", "benchmark", "live"] as const;
export const REPLAYABILITY_STATUSES = [
  "replayable",
  "partially_replayable",
  "non_replayable",
] as const;
export const TOOL_CALL_STATUSES = ["started", "completed", "failed"] as const;
export const VERIFIER_OUTCOMES = ["approved", "repair_requested", "escalated", "vetoed"] as const;

export const RunTraceModeSchema = stringEnum(RUN_TRACE_MODES);
export const ReplayabilityStatusSchema = stringEnum(REPLAYABILITY_STATUSES);
export const ToolCallStatusSchema = stringEnum(TOOL_CALL_STATUSES);
export const VerifierOutcomeSchema = stringEnum(VERIFIER_OUTCOMES);

export const SessionReferenceSchema = Type.Object(
  {
    session_id: NonEmptyString,
    transcript_path: Type.Optional(NonEmptyString),
    route: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const PlannerExchangeSchema = Type.Object(
  {
    stage_id: IdentifierString,
    summary: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ActionProposalRecordSchema = Type.Object(
  {
    proposal_id: IdentifierString,
    selected_tool: NonEmptyString,
    selected_reason: Type.Optional(NonEmptyString),
    guard_decision: Type.Optional(NonEmptyString),
    attempt_index: Type.Optional(Type.Integer({ minimum: 0 })),
    previous_attempt_ref: Type.Optional(IdentifierString),
  },
  { additionalProperties: false },
);

export const ToolCallRecordSchema = Type.Object(
  {
    tool_call_id: IdentifierString,
    tool_name: NonEmptyString,
    status: ToolCallStatusSchema,
    arguments_summary: Type.Optional(NonEmptyString),
    output_summary: Type.Optional(NonEmptyString),
    error_summary: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ObservationRecordSchema = Type.Object(
  {
    observation_id: IdentifierString,
    source: NonEmptyString,
    summary: NonEmptyString,
  },
  { additionalProperties: false },
);

export const VerifierDecisionRecordSchema = Type.Object(
  {
    decision_id: IdentifierString,
    outcome: VerifierOutcomeSchema,
    rationale: NonEmptyString,
  },
  { additionalProperties: false },
);

export const FinalOutputRecordSchema = Type.Object(
  {
    output_id: IdentifierString,
    output_type: NonEmptyString,
    content_summary: NonEmptyString,
    emitted_to_user: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const UsageSummarySchema = Type.Object(
  {
    input_tokens: Type.Integer({ minimum: 0 }),
    output_tokens: Type.Integer({ minimum: 0 }),
    total_tokens: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const LatencySummarySchema = Type.Object(
  {
    planner_ms: Type.Integer({ minimum: 0 }),
    tool_ms: Type.Integer({ minimum: 0 }),
    verifier_ms: Type.Integer({ minimum: 0 }),
    end_to_end_ms: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const CostSummarySchema = Type.Object(
  {
    currency: NonEmptyString,
    total_cost: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TracePhaseTimestampsSchema = Type.Object(
  {
    planner_started_at: TimestampString,
    planner_finished_at: TimestampString,
    action_proposal_started_at: TimestampString,
    action_proposal_finished_at: TimestampString,
    tool_execution_started_at: TimestampString,
    tool_execution_finished_at: TimestampString,
    verifier_started_at: TimestampString,
    verifier_finished_at: TimestampString,
    final_emission_at: TimestampString,
    trace_persisted_at: TimestampString,
  },
  { additionalProperties: false },
);

export const EvidenceSourceRefSchema = Type.Object(
  {
    source_id: IdentifierString,
    source_hash_or_ref: NonEmptyString,
  },
  { additionalProperties: false },
);

export const EvidenceBundleRefSchema = Type.Object(
  {
    evidence_bundle_id: IdentifierString,
    source_refs: Type.Array(EvidenceSourceRefSchema, { minItems: 1 }),
    retrieval_query: NonEmptyString,
    reranker_output: Type.Array(IdentifierString, { minItems: 1 }),
    delivered_evidence: Type.Array(NonEmptyString, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const BenchmarkArmReferenceSchema = Type.Object(
  {
    benchmark_arm_id: IdentifierString,
  },
  { additionalProperties: false },
);

export const BenchmarkCaseReferenceSchema = Type.Object(
  {
    case_kind: BenchmarkCaseKindSchema,
    case_id: IdentifierString,
  },
  { additionalProperties: false },
);

export const RunTraceSchema = Type.Object(
  {
    trace_id: IdentifierString,
    run_id: IdentifierString,
    niche_program_id: IdentifierString,
    domain_pack_id: IdentifierString,
    mode: RunTraceModeSchema,
    session_ref: SessionReferenceSchema,
    planner_inputs: Type.Array(PlannerExchangeSchema),
    planner_outputs: Type.Array(PlannerExchangeSchema),
    action_proposals: Type.Array(ActionProposalRecordSchema),
    tool_calls: Type.Array(ToolCallRecordSchema),
    observations: Type.Array(ObservationRecordSchema),
    verifier_decisions: Type.Array(VerifierDecisionRecordSchema),
    final_output: FinalOutputRecordSchema,
    usage: UsageSummarySchema,
    latency: LatencySummarySchema,
    cost: CostSummarySchema,
    failure_labels: Type.Array(IdentifierString),
    artifact_refs: Type.Array(ArtifactRefSchema),
    baseline_or_candidate_manifest_id: IdentifierString,
    planner_version_id: IdentifierString,
    action_policy_version_id: IdentifierString,
    verifier_pack_version_id: IdentifierString,
    retrieval_stack_version_id: IdentifierString,
    grader_set_version_id: IdentifierString,
    source_access_manifest_id: IdentifierString,
    runtime_snapshot_id: IdentifierString,
    context_bundle_id: IdentifierString,
    evidence_bundle_refs: Type.Array(EvidenceBundleRefSchema),
    benchmark_arm_ref: Type.Optional(BenchmarkArmReferenceSchema),
    benchmark_case_ref: Type.Optional(BenchmarkCaseReferenceSchema),
    determinism_policy_id: IdentifierString,
    random_seed: NonEmptyString,
    phase_timestamps: TracePhaseTimestampsSchema,
    wall_clock_start_at: TimestampString,
    wall_clock_end_at: TimestampString,
    replayability_status: ReplayabilityStatusSchema,
    determinism_notes: NonEmptyString,
  },
  { additionalProperties: false },
);

export type RunTraceMode = Static<typeof RunTraceModeSchema>;
export type ReplayabilityStatus = Static<typeof ReplayabilityStatusSchema>;
export type ToolCallStatus = Static<typeof ToolCallStatusSchema>;
export type VerifierOutcome = Static<typeof VerifierOutcomeSchema>;
export type SessionReference = Static<typeof SessionReferenceSchema>;
export type PlannerExchange = Static<typeof PlannerExchangeSchema>;
export type ActionProposalRecord = Static<typeof ActionProposalRecordSchema>;
export type ToolCallRecord = Static<typeof ToolCallRecordSchema>;
export type ObservationRecord = Static<typeof ObservationRecordSchema>;
export type VerifierDecisionRecord = Static<typeof VerifierDecisionRecordSchema>;
export type FinalOutputRecord = Static<typeof FinalOutputRecordSchema>;
export type UsageSummary = Static<typeof UsageSummarySchema>;
export type LatencySummary = Static<typeof LatencySummarySchema>;
export type CostSummary = Static<typeof CostSummarySchema>;
export type TracePhaseTimestamps = Static<typeof TracePhaseTimestampsSchema>;
export type EvidenceSourceRef = Static<typeof EvidenceSourceRefSchema>;
export type EvidenceBundleRef = Static<typeof EvidenceBundleRefSchema>;
export type BenchmarkArmReference = Static<typeof BenchmarkArmReferenceSchema>;
export type BenchmarkCaseReference = Static<typeof BenchmarkCaseReferenceSchema>;
export type RunTrace = Static<typeof RunTraceSchema>;
