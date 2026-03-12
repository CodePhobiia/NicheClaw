import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  BenchmarkCaseReferenceSchema,
  IdentifierString,
  NonEmptyString,
  ReplayabilityStatusSchema,
  TimestampString,
  stringEnum,
} from "../schema/index.js";
import { ActionSeamInputSchema, VerifierSeamOutputSchema } from "./seams.js";

export const LIFECYCLE_EVENT_TYPES = [
  "planner_proposed",
  "action_proposed",
  "action_validated",
  "verifier_decision",
  "run_trace_persisted",
  "benchmark_case_started",
  "benchmark_case_finished",
  "candidate_promoted",
] as const;
export const LifecycleEventTypeSchema = stringEnum(LIFECYCLE_EVENT_TYPES);

const LifecycleEnvelopeFields = {
  event_id: IdentifierString,
  event_type: LifecycleEventTypeSchema,
  occurred_at: TimestampString,
  run_id: IdentifierString,
  niche_program_id: IdentifierString,
  baseline_manifest_id: Type.Optional(IdentifierString),
  candidate_manifest_id: Type.Optional(IdentifierString),
} as const;

export const PlannerProposedPayloadSchema = Type.Object(
  {
    selected_manifest_id: IdentifierString,
    planner_runtime_component_id: IdentifierString,
    benchmark_suite_id: Type.Optional(IdentifierString),
  },
  { additionalProperties: false },
);

export const ActionProposedPayloadSchema = ActionSeamInputSchema;

export const ActionValidatedPayloadSchema = Type.Object(
  {
    proposal_id: IdentifierString,
    guard_decision: NonEmptyString,
    ready_for_execution: Type.Boolean(),
    repair_strategy_id: Type.Optional(IdentifierString),
  },
  { additionalProperties: false },
);

export const VerifierDecisionPayloadSchema = VerifierSeamOutputSchema;

export const RunTracePersistedPayloadSchema = Type.Object(
  {
    trace_id: IdentifierString,
    replayability_status: ReplayabilityStatusSchema,
    persisted_path: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BenchmarkCaseStartedPayloadSchema = Type.Object(
  {
    benchmark_arm_id: IdentifierString,
    benchmark_case_ref: BenchmarkCaseReferenceSchema,
  },
  { additionalProperties: false },
);

export const BenchmarkCaseFinishedPayloadSchema = Type.Object(
  {
    benchmark_arm_id: IdentifierString,
    benchmark_case_ref: BenchmarkCaseReferenceSchema,
    invalidated: Type.Boolean(),
    outcome_summary: NonEmptyString,
  },
  { additionalProperties: false },
);

export const CandidatePromotedPayloadSchema = Type.Object(
  {
    candidate_release_id: IdentifierString,
    rollback_target: IdentifierString,
  },
  { additionalProperties: false },
);

export const PlannerProposedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("planner_proposed"),
    payload: PlannerProposedPayloadSchema,
  },
  { additionalProperties: false },
);

export const ActionProposedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("action_proposed"),
    payload: ActionProposedPayloadSchema,
  },
  { additionalProperties: false },
);

export const ActionValidatedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("action_validated"),
    payload: ActionValidatedPayloadSchema,
  },
  { additionalProperties: false },
);

export const VerifierDecisionEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("verifier_decision"),
    payload: VerifierDecisionPayloadSchema,
  },
  { additionalProperties: false },
);

export const RunTracePersistedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("run_trace_persisted"),
    payload: RunTracePersistedPayloadSchema,
  },
  { additionalProperties: false },
);

export const BenchmarkCaseStartedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("benchmark_case_started"),
    payload: BenchmarkCaseStartedPayloadSchema,
  },
  { additionalProperties: false },
);

export const BenchmarkCaseFinishedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("benchmark_case_finished"),
    payload: BenchmarkCaseFinishedPayloadSchema,
  },
  { additionalProperties: false },
);

export const CandidatePromotedEventSchema = Type.Object(
  {
    ...LifecycleEnvelopeFields,
    event_type: Type.Literal("candidate_promoted"),
    payload: CandidatePromotedPayloadSchema,
  },
  { additionalProperties: false },
);

export const LifecycleEventSchema = Type.Union([
  PlannerProposedEventSchema,
  ActionProposedEventSchema,
  ActionValidatedEventSchema,
  VerifierDecisionEventSchema,
  RunTracePersistedEventSchema,
  BenchmarkCaseStartedEventSchema,
  BenchmarkCaseFinishedEventSchema,
  CandidatePromotedEventSchema,
]);

export type LifecycleEventType = Static<typeof LifecycleEventTypeSchema>;
export type PlannerProposedPayload = Static<typeof PlannerProposedPayloadSchema>;
export type ActionProposedPayload = Static<typeof ActionProposedPayloadSchema>;
export type ActionValidatedPayload = Static<typeof ActionValidatedPayloadSchema>;
export type VerifierDecisionPayload = Static<typeof VerifierDecisionPayloadSchema>;
export type RunTracePersistedPayload = Static<typeof RunTracePersistedPayloadSchema>;
export type BenchmarkCaseStartedPayload = Static<typeof BenchmarkCaseStartedPayloadSchema>;
export type BenchmarkCaseFinishedPayload = Static<typeof BenchmarkCaseFinishedPayloadSchema>;
export type CandidatePromotedPayload = Static<typeof CandidatePromotedPayloadSchema>;
export type PlannerProposedEvent = Static<typeof PlannerProposedEventSchema>;
export type ActionProposedEvent = Static<typeof ActionProposedEventSchema>;
export type ActionValidatedEvent = Static<typeof ActionValidatedEventSchema>;
export type VerifierDecisionEvent = Static<typeof VerifierDecisionEventSchema>;
export type RunTracePersistedEvent = Static<typeof RunTracePersistedEventSchema>;
export type BenchmarkCaseStartedEvent = Static<typeof BenchmarkCaseStartedEventSchema>;
export type BenchmarkCaseFinishedEvent = Static<typeof BenchmarkCaseFinishedEventSchema>;
export type CandidatePromotedEvent = Static<typeof CandidatePromotedEventSchema>;
export type LifecycleEvent = Static<typeof LifecycleEventSchema>;
