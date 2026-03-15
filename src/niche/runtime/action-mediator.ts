import { evaluateActionGuard, selectActionProposal } from "../action-policy/index.js";
import {
  evaluateRepairDecision,
  type RepairPolicyDecision,
} from "../action-policy/repair-policy.js";
import {
  buildActionCandidatesForTool,
  getNicheRunTraceContext,
  recordActionProposalForRun,
} from "./run-trace-capture.js";

export type NicheActionMediationResult = null | {
  blocked: boolean;
  reason?: string;
  proposalId: string;
  repairDecision: RepairPolicyDecision;
  params: unknown;
};

export function mediateNicheToolCall(params: {
  runId?: string;
  toolCallId?: string;
  toolName: string;
  rawParams: unknown;
}): NicheActionMediationResult {
  if (!params.runId || !params.toolCallId) {
    return null;
  }
  const context = getNicheRunTraceContext(params.runId);
  if (!context) {
    return null;
  }

  const guardDecision = evaluateActionGuard({
    toolName: params.toolName,
    allowedTools: context.actionPolicy.allowedTools,
    schemaAvailable: true,
    permissionAllowed: !context.actionPolicy.permissionDeniedTools?.includes(params.toolName),
    domainConstraintViolations:
      context.actionPolicy.domainConstraintViolationsByTool?.[params.toolName] ?? [],
    releaseConstraintViolations:
      context.actionPolicy.releaseConstraintViolationsByTool?.[params.toolName] ?? [],
  });
  const proposal = selectActionProposal({
    proposalId: params.toolCallId,
    candidates: buildActionCandidatesForTool({
      toolName: params.toolName,
      rawParams: params.rawParams,
      context,
    }),
    guardDecision,
    attemptIndex: 0,
  });
  const repairDecision = evaluateRepairDecision({
    guardDecision,
    attemptIndex: proposal.attempt_index,
    maxRepairAttempts: context.actionPolicy.maxRepairAttempts,
    maxRetryAttempts: context.actionPolicy.maxRetryAttempts,
  });

  if (repairDecision.strategyId) {
    proposal.repair_strategy_id = repairDecision.strategyId;
  }
  recordActionProposalForRun(params.runId, guardDecision, proposal);

  const blocked =
    !guardDecision.allowed &&
    (repairDecision.action === "repair" ||
      repairDecision.action === "escalate" ||
      repairDecision.action === "stop");

  return {
    blocked,
    reason: blocked ? repairDecision.reason : undefined,
    proposalId: proposal.proposal_id,
    repairDecision,
    params: params.rawParams,
  };
}
