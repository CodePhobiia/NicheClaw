import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import {
  ArbitrationModeSchema,
  GraderTypeSchema,
  IdentifierString,
  NonEmptyString,
  stringEnum,
  type ArbitrationMode,
  type GraderType,
} from "../schema/index.js";

export const GRADER_SIGNAL_OUTCOMES = ["pass", "fail"] as const;
export const ARBITRATION_DECISION_OUTCOMES = ["pass", "fail", "needs_sme"] as const;

export const GraderSignalOutcomeSchema = stringEnum(GRADER_SIGNAL_OUTCOMES);
export const ArbitrationDecisionOutcomeSchema = stringEnum(ARBITRATION_DECISION_OUTCOMES);

export const GraderSignalSchema = Type.Object(
  {
    grader_id: IdentifierString,
    grader_type: GraderTypeSchema,
    outcome: GraderSignalOutcomeSchema,
    score: Type.Number({ minimum: 0, maximum: 1 }),
    blocking: Type.Boolean(),
    rationale: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export const ArbitrationDecisionSchema = Type.Object(
  {
    arbitration_mode: ArbitrationModeSchema,
    outcome: ArbitrationDecisionOutcomeSchema,
    conflict_detected: Type.Boolean(),
    selected_signal_ids: Type.Array(IdentifierString),
    rationale: NonEmptyString,
  },
  { additionalProperties: false },
);

export type GraderSignalOutcome = Static<typeof GraderSignalOutcomeSchema>;
export type ArbitrationDecisionOutcome = Static<typeof ArbitrationDecisionOutcomeSchema>;
export type GraderSignal = Static<typeof GraderSignalSchema>;
export type ArbitrationDecision = Static<typeof ArbitrationDecisionSchema>;

const SIGNAL_TYPE_WEIGHTS: Record<GraderType, number> = {
  deterministic_rule: 5,
  schema_validator: 4,
  trace_grader: 3,
  model_based: 2,
  sme_review: 6,
  pairwise_preference: 2,
};

function hasConflict(signals: GraderSignal[]): boolean {
  return new Set(signals.map((signal) => signal.outcome)).size > 1;
}

function weightedVote(signals: GraderSignal[]): ArbitrationDecision {
  const passWeight = signals
    .filter((signal) => signal.outcome === "pass")
    .reduce((sum, signal) => sum + SIGNAL_TYPE_WEIGHTS[signal.grader_type] * signal.score, 0);
  const failWeight = signals
    .filter((signal) => signal.outcome === "fail")
    .reduce((sum, signal) => sum + SIGNAL_TYPE_WEIGHTS[signal.grader_type] * signal.score, 0);

  if (passWeight === failWeight) {
    return {
      arbitration_mode: "weighted_vote",
      outcome: "needs_sme",
      conflict_detected: hasConflict(signals),
      selected_signal_ids: signals.map((signal) => signal.grader_id),
      rationale: "Weighted vote tied across competing grader signals.",
    };
  }

  const outcome = passWeight > failWeight ? "pass" : "fail";
  return {
    arbitration_mode: "weighted_vote",
    outcome,
    conflict_detected: hasConflict(signals),
    selected_signal_ids: signals.map((signal) => signal.grader_id),
    rationale: `Weighted vote selected ${outcome}.`,
  };
}

export function arbitrateGraderSignals(params: {
  mode: ArbitrationMode;
  signals: GraderSignal[];
  smeDecision?: Extract<ArbitrationDecisionOutcome, "pass" | "fail">;
}): ArbitrationDecision {
  if (params.signals.length === 0) {
    throw new Error("Cannot arbitrate an empty set of grader signals.");
  }

  const conflictDetected = hasConflict(params.signals);
  const deterministicFailure = params.signals.find(
    (signal) =>
      (signal.grader_type === "deterministic_rule" || signal.grader_type === "schema_validator") &&
      signal.outcome === "fail" &&
      signal.blocking,
  );
  const smeSignal = params.signals.find((signal) => signal.grader_type === "sme_review");

  if (params.mode === "rule_first") {
    if (deterministicFailure) {
      return {
        arbitration_mode: params.mode,
        outcome: "fail",
        conflict_detected: conflictDetected,
        selected_signal_ids: [deterministicFailure.grader_id],
        rationale: "Rule-first arbitration prioritised a blocking deterministic failure.",
      };
    }
    return {
      ...weightedVote(params.signals),
      arbitration_mode: params.mode,
      rationale:
        "Rule-first arbitration fell back to weighted voting after no blocking rule failure.",
    };
  }

  if (params.mode === "hierarchical_override") {
    if (smeSignal) {
      return {
        arbitration_mode: params.mode,
        outcome: smeSignal.outcome,
        conflict_detected: conflictDetected,
        selected_signal_ids: [smeSignal.grader_id],
        rationale: "Hierarchical override prioritised the SME review signal.",
      };
    }
    if (deterministicFailure) {
      return {
        arbitration_mode: params.mode,
        outcome: "fail",
        conflict_detected: conflictDetected,
        selected_signal_ids: [deterministicFailure.grader_id],
        rationale: "Hierarchical override prioritised a blocking deterministic failure.",
      };
    }
    return {
      ...weightedVote(params.signals),
      arbitration_mode: params.mode,
      rationale: "Hierarchical override fell back to weighted voting.",
    };
  }

  if (params.mode === "weighted_vote") {
    return weightedVote(params.signals);
  }

  if (!conflictDetected) {
    const first = params.signals[0];
    return {
      arbitration_mode: params.mode,
      outcome: first?.outcome ?? "needs_sme",
      conflict_detected: false,
      selected_signal_ids: params.signals.map((signal) => signal.grader_id),
      rationale: "Signals agree, so SME escalation is not required.",
    };
  }

  if (params.smeDecision) {
    return {
      arbitration_mode: params.mode,
      outcome: params.smeDecision,
      conflict_detected: true,
      selected_signal_ids: params.signals.map((signal) => signal.grader_id),
      rationale: "Conflict was resolved by explicit SME decision.",
    };
  }

  return {
    arbitration_mode: params.mode,
    outcome: "needs_sme",
    conflict_detected: true,
    selected_signal_ids: params.signals.map((signal) => signal.grader_id),
    rationale: "Conflicting grader signals require SME adjudication.",
  };
}
