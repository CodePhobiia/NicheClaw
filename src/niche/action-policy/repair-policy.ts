import type { GuardDecision } from "./types.js";

export type ToolOutcome = {
  status: "success" | "failed";
  transient?: boolean;
  errorMessage?: string;
};

export type RepairDecisionAction = "proceed" | "repair" | "retry" | "escalate" | "stop";

export type RepairPolicyDecision = {
  action: RepairDecisionAction;
  strategyId?: string;
  reason: string;
};

export function evaluateRepairDecision(params: {
  guardDecision: GuardDecision;
  toolOutcome?: ToolOutcome;
  attemptIndex: number;
  maxRepairAttempts?: number;
  maxRetryAttempts?: number;
}): RepairPolicyDecision {
  const maxRepairAttempts = params.maxRepairAttempts ?? 1;
  const maxRetryAttempts = params.maxRetryAttempts ?? 1;

  if (!params.guardDecision.allowed) {
    if (params.attemptIndex < maxRepairAttempts) {
      return {
        action: "repair",
        strategyId: `repair-${params.guardDecision.code}`,
        reason: params.guardDecision.reason,
      };
    }
    return {
      action: "escalate",
      strategyId: `escalate-${params.guardDecision.code}`,
      reason: params.guardDecision.reason,
    };
  }

  if (!params.toolOutcome || params.toolOutcome.status === "success") {
    return {
      action: "proceed",
      reason: "No repair or retry required.",
    };
  }

  if (params.toolOutcome.transient && params.attemptIndex < maxRetryAttempts) {
    return {
      action: "retry",
      strategyId: "retry-transient-failure",
      reason: params.toolOutcome.errorMessage ?? "Transient tool failure.",
    };
  }

  if (params.attemptIndex < maxRepairAttempts) {
    return {
      action: "repair",
      strategyId: "repair-tool-failure",
      reason: params.toolOutcome.errorMessage ?? "Tool failure requires repair.",
    };
  }

  return {
    action: "stop",
    strategyId: "stop-after-failure",
    reason: params.toolOutcome.errorMessage ?? "Tool failure exhausted retry and repair attempts.",
  };
}
