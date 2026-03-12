import type { VerifierDecision } from "./pack.js";

export type VerifierMetricGroundTruth = "should_allow" | "should_intervene";

export type VerifierMetricInput = {
  case_id: string;
  decision: Pick<VerifierDecision, "outcome" | "latency_added_ms" | "cost_added">;
  ground_truth: VerifierMetricGroundTruth;
  operator_override_applied: boolean;
};

export type VerifierMetricSummary = {
  sample_count: number;
  true_positive_rate: number;
  false_positive_rate: number;
  false_veto_rate: number;
  pass_through_rate: number;
  override_rate: number;
  mean_latency_added_ms: number;
  mean_cost_added: number;
  total_cost_added: number;
  counts: {
    true_positive: number;
    false_positive: number;
    false_veto: number;
    pass_through: number;
    overrides: number;
  };
};

function isInterventionOutcome(outcome: VerifierDecision["outcome"]): boolean {
  return outcome !== "approved";
}

export function computeVerifierMetrics(
  inputs: VerifierMetricInput[],
): VerifierMetricSummary {
  let truePositive = 0;
  let falsePositive = 0;
  let falseVeto = 0;
  let passThrough = 0;
  let overrides = 0;
  let totalLatencyAdded = 0;
  let totalCostAdded = 0;

  for (const input of inputs) {
    const intervened = isInterventionOutcome(input.decision.outcome);
    if (intervened && input.ground_truth === "should_intervene") {
      truePositive += 1;
    }
    if (intervened && input.ground_truth === "should_allow") {
      falsePositive += 1;
    }
    if (input.decision.outcome === "vetoed" && input.ground_truth === "should_allow") {
      falseVeto += 1;
    }
    if (input.decision.outcome === "approved" && input.ground_truth === "should_allow") {
      passThrough += 1;
    }
    if (input.operator_override_applied) {
      overrides += 1;
    }
    totalLatencyAdded += input.decision.latency_added_ms;
    totalCostAdded += input.decision.cost_added;
  }

  const sampleCount = inputs.length;
  return {
    sample_count: sampleCount,
    true_positive_rate: sampleCount === 0 ? 0 : truePositive / sampleCount,
    false_positive_rate: sampleCount === 0 ? 0 : falsePositive / sampleCount,
    false_veto_rate: sampleCount === 0 ? 0 : falseVeto / sampleCount,
    pass_through_rate: sampleCount === 0 ? 0 : passThrough / sampleCount,
    override_rate: sampleCount === 0 ? 0 : overrides / sampleCount,
    mean_latency_added_ms: sampleCount === 0 ? 0 : totalLatencyAdded / sampleCount,
    mean_cost_added: sampleCount === 0 ? 0 : totalCostAdded / sampleCount,
    total_cost_added: totalCostAdded,
    counts: {
      true_positive: truePositive,
      false_positive: falsePositive,
      false_veto: falseVeto,
      pass_through: passThrough,
      overrides,
    },
  };
}
