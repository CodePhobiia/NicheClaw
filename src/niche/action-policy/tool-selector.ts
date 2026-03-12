import type { ActionCandidate, ActionCandidateRanking, ActionProposal, GuardDecision } from "./types.js";

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildRanking(candidate: ActionCandidate): ActionCandidateRanking {
  const missingRequiredArguments = candidate.required_argument_names.filter(
    (argumentName) => !candidate.provided_argument_names.includes(argumentName),
  );
  const domainMatchScore = candidate.domain_match_score ?? 0;
  const reliabilityScore = candidate.reliability_score ?? 0;
  const riskPenalty = candidate.risk_score ?? 0;
  const missingPenalty = missingRequiredArguments.length * 0.25;
  const score = roundScore(domainMatchScore + reliabilityScore - riskPenalty - missingPenalty);

  return {
    tool_name: candidate.tool_name,
    score,
    reason: candidate.rationale,
    missing_required_arguments: missingRequiredArguments,
  };
}

export function selectActionProposal(params: {
  proposalId: string;
  candidates: ActionCandidate[];
  guardDecision: GuardDecision;
  repairStrategyId?: string;
  attemptIndex: number;
  previousAttemptRef?: string;
}): ActionProposal {
  if (params.candidates.length === 0) {
    throw new Error("Cannot select an action proposal without at least one candidate.");
  }

  const candidateRankings = params.candidates
    .map((candidate) => buildRanking(candidate))
    .toSorted((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.tool_name.localeCompare(right.tool_name);
    });
  const selected = candidateRankings[0];
  if (!selected) {
    throw new Error("Action proposal selection produced no ranked candidates.");
  }

  return {
    proposal_id: params.proposalId,
    selected_tool: selected.tool_name,
    selected_reason: selected.reason,
    guard_decision: params.guardDecision.code,
    guard_failure_reason: params.guardDecision.allowed ? undefined : params.guardDecision.reason,
    selector_score: selected.score,
    candidate_rankings: candidateRankings,
    repair_strategy_id: params.repairStrategyId,
    attempt_index: params.attemptIndex,
    previous_attempt_ref: params.previousAttemptRef,
  };
}
