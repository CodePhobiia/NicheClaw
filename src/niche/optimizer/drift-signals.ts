import type { VerifierMetricSummary } from "../verifier/index.js";
import type { PromotedMonitorAssessment, PromotedMonitorDefinition } from "../release/index.js";

export type RefreshTriggerSummary = {
  warranted: boolean;
  severity: "none" | "watch" | "refresh";
  reasons: string[];
};

export function buildRefreshTriggerSummary(params: {
  monitorDefinition: PromotedMonitorDefinition;
  monitorAssessment: PromotedMonitorAssessment;
  verifierMetrics: VerifierMetricSummary;
  graderDisagreementRate: number;
  sourceFreshnessDecay: number;
}): RefreshTriggerSummary {
  const reasons: string[] = [];

  if (params.monitorAssessment.should_rollback) {
    reasons.push("Promoted monitor indicates rollback-level drift.");
  }
  if (params.monitorAssessment.breached_dimensions.length > 0) {
    reasons.push(
      `Promoted monitor breached dimensions: ${params.monitorAssessment.breached_dimensions.join(", ")}.`,
    );
  }
  if (
    params.verifierMetrics.false_veto_rate >
    params.monitorDefinition.monitor.verifier_drift_thresholds.verifier_false_veto_drift
  ) {
    reasons.push("Verifier false-veto drift exceeds the monitor threshold.");
  }
  if (
    params.graderDisagreementRate >
    params.monitorDefinition.monitor.grader_drift_thresholds.grader_disagreement_drift
  ) {
    reasons.push("Grader disagreement drift exceeds the monitor threshold.");
  }
  if (
    params.sourceFreshnessDecay >
    params.monitorDefinition.monitor.drift_thresholds.source_freshness_decay
  ) {
    reasons.push("Source freshness decay exceeds the monitor threshold.");
  }

  if (reasons.length === 0) {
    return {
      warranted: false,
      severity: "none",
      reasons: [],
    };
  }

  return {
    warranted: true,
    severity:
      params.monitorAssessment.should_rollback || reasons.length >= 2 ? "refresh" : "watch",
    reasons,
  };
}
