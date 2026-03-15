import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  BenchmarkCaseReferenceSchema,
  BenchmarkModeSchema,
  EvidenceBundleRefSchema,
  IdentifierString,
  NonEmptyString,
  ReplayabilityStatusSchema,
  RunTraceModeSchema,
  RunTraceSchema,
  stringEnum,
} from "../schema/index.js";

export const VERIFIER_SEAM_OUTCOMES = [
  "approved",
  "repair_requested",
  "escalated",
  "vetoed",
] as const;
export const VerifierSeamOutcomeSchema = stringEnum(VERIFIER_SEAM_OUTCOMES);

export const PlannerSeamInputSchema = Type.Object(
  {
    run_id: IdentifierString,
    session_id: NonEmptyString,
    niche_program_id: IdentifierString,
    domain_pack_id: Type.Optional(IdentifierString),
    baseline_manifest_id: Type.Optional(IdentifierString),
    candidate_manifest_id: Type.Optional(IdentifierString),
    source_access_manifest_id: IdentifierString,
    benchmark_suite_id: Type.Optional(IdentifierString),
    benchmark_mode: Type.Optional(BenchmarkModeSchema),
    planner_runtime_component_id: IdentifierString,
  },
  { additionalProperties: false },
);

export const PlannerSeamOutputSchema = Type.Object(
  {
    selected_manifest_id: IdentifierString,
    run_mode: RunTraceModeSchema,
    planner_context_summary: NonEmptyString,
    benchmark_case_ref: Type.Optional(BenchmarkCaseReferenceSchema),
  },
  { additionalProperties: false },
);

export const PlannerSeamContractSchema = Type.Object(
  {
    seam: Type.Literal("planner"),
    input: PlannerSeamInputSchema,
    output: PlannerSeamOutputSchema,
  },
  { additionalProperties: false },
);

export const ActionCandidateRankingSchema = Type.Object(
  {
    tool_name: NonEmptyString,
    score: Type.Number(),
    reason: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ActionSeamInputSchema = Type.Object(
  {
    proposal_id: IdentifierString,
    run_id: IdentifierString,
    niche_program_id: IdentifierString,
    selected_tool: NonEmptyString,
    selected_reason: NonEmptyString,
    guard_decision: NonEmptyString,
    guard_failure_reason: Type.Optional(NonEmptyString),
    selector_score: Type.Number(),
    candidate_rankings: Type.Array(ActionCandidateRankingSchema, { minItems: 1 }),
    repair_strategy_id: Type.Optional(IdentifierString),
    attempt_index: Type.Integer({ minimum: 0 }),
    previous_attempt_ref: Type.Optional(IdentifierString),
  },
  { additionalProperties: false },
);

export const ActionSeamOutputSchema = Type.Object(
  {
    tool_call_id: IdentifierString,
    ready_for_execution: Type.Boolean(),
    repair_requested: Type.Boolean(),
    execution_summary: NonEmptyString,
  },
  { additionalProperties: false },
);

export const ActionSeamContractSchema = Type.Object(
  {
    seam: Type.Literal("action"),
    input: ActionSeamInputSchema,
    output: ActionSeamOutputSchema,
  },
  { additionalProperties: false },
);

export const VerifierFindingSchema = Type.Object(
  {
    finding_id: IdentifierString,
    severity: NonEmptyString,
    message: NonEmptyString,
  },
  { additionalProperties: false },
);

export const VerifierSeamInputSchema = Type.Object(
  {
    run_id: IdentifierString,
    candidate_output_summary: NonEmptyString,
    verifier_pack_version_id: IdentifierString,
    source_access_manifest_id: IdentifierString,
    evidence_bundle_refs: Type.Array(EvidenceBundleRefSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const VerifierSeamOutputSchema = Type.Object(
  {
    decision_id: IdentifierString,
    outcome: VerifierSeamOutcomeSchema,
    rationale: NonEmptyString,
    findings: Type.Array(VerifierFindingSchema),
  },
  { additionalProperties: false },
);

export const VerifierSeamContractSchema = Type.Object(
  {
    seam: Type.Literal("verifier"),
    input: VerifierSeamInputSchema,
    output: VerifierSeamOutputSchema,
  },
  { additionalProperties: false },
);

export const TraceSeamOutputSchema = Type.Object(
  {
    persisted_trace_id: IdentifierString,
    persisted_path: NonEmptyString,
    replayability_status: ReplayabilityStatusSchema,
    artifact_ref_count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const TraceSeamContractSchema = Type.Object(
  {
    seam: Type.Literal("trace"),
    input: RunTraceSchema,
    output: TraceSeamOutputSchema,
  },
  { additionalProperties: false },
);

export function plannerSeamHasManifestBinding(
  input: Static<typeof PlannerSeamInputSchema>,
): boolean {
  return Boolean(input.baseline_manifest_id || input.candidate_manifest_id);
}

export function actionSeamHasStructuredProposal(
  input: Static<typeof ActionSeamInputSchema>,
): boolean {
  return input.candidate_rankings.length > 0 && input.selected_tool.length > 0;
}

export function traceSeamHasBenchmarkContext(
  input: Static<typeof TraceSeamContractSchema>["input"],
): boolean {
  if (input.mode !== "benchmark") {
    return true;
  }
  return Boolean(input.benchmark_arm_ref && input.benchmark_case_ref);
}

export type PlannerSeamInput = Static<typeof PlannerSeamInputSchema>;
export type PlannerSeamOutput = Static<typeof PlannerSeamOutputSchema>;
export type PlannerSeamContract = Static<typeof PlannerSeamContractSchema>;
export type ActionCandidateRanking = Static<typeof ActionCandidateRankingSchema>;
export type ActionSeamInput = Static<typeof ActionSeamInputSchema>;
export type ActionSeamOutput = Static<typeof ActionSeamOutputSchema>;
export type ActionSeamContract = Static<typeof ActionSeamContractSchema>;
export type VerifierFinding = Static<typeof VerifierFindingSchema>;
export type VerifierSeamInput = Static<typeof VerifierSeamInputSchema>;
export type VerifierSeamOutput = Static<typeof VerifierSeamOutputSchema>;
export type VerifierSeamContract = Static<typeof VerifierSeamContractSchema>;
export type TraceSeamOutput = Static<typeof TraceSeamOutputSchema>;
export type TraceSeamContract = Static<typeof TraceSeamContractSchema>;
