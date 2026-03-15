import type { ArtifactRef, GovernedDataStatus } from "../schema/index.js";

export type RefreshTraceCandidate = {
  trace_ref: ArtifactRef;
  governed_data_status: GovernedDataStatus;
  task_family: string;
  failure_labels: string[];
  contamination_detected: boolean;
  embargo_active?: boolean;
  contamination_checked?: boolean;
  rights_confirmed?: boolean;
  evaluation_cycles_elapsed?: number;
};

export type RefreshEligibility = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateRefreshEligibility(trace: RefreshTraceCandidate): RefreshEligibility {
  const reasons: string[] = [];

  if (trace.contamination_detected) {
    reasons.push("Trace is contaminated and cannot enter optimization flows.");
  }
  if (trace.governed_data_status.quarantined) {
    reasons.push("Trace is quarantined and cannot enter optimization flows.");
  }

  switch (trace.governed_data_status.data_zone) {
    case "gold_eval":
      reasons.push("Gold eval traces may never enter optimization flows.");
      break;
    case "hidden_eval":
      reasons.push("Hidden eval traces may never enter optimization flows.");
      break;
    case "quarantined":
      reasons.push("Quarantined traces may not be reused.");
      break;
    case "shadow_only":
      if (trace.embargo_active !== false) {
        reasons.push("Shadow-only trace remains under embargo.");
      }
      if ((trace.evaluation_cycles_elapsed ?? 0) < 1) {
        reasons.push("Shadow-only trace has not cleared the minimum evaluation cycle embargo.");
      }
      if (!trace.contamination_checked) {
        reasons.push("Shadow-only trace must pass contamination checks before reuse.");
      }
      if (!trace.rights_confirmed) {
        reasons.push("Shadow-only trace must pass rights confirmation before reuse.");
      }
      break;
    default:
      break;
  }

  if (!trace.trace_ref.rights_state.rights_to_train) {
    reasons.push("Trace lineage lacks rights_to_train.");
  }
  if (!trace.trace_ref.rights_state.rights_to_derive) {
    reasons.push("Trace lineage lacks rights_to_derive.");
  }
  if (!trace.trace_ref.rights_state.rights_to_generate_synthetic_from) {
    reasons.push("Trace lineage lacks rights_to_generate_synthetic_from.");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
