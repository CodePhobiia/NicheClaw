export type GuardDecisionCode =
  | "allowed"
  | "tool_not_allowed"
  | "missing_schema"
  | "permission_denied"
  | "domain_constraint_violation"
  | "release_constraint_violation";

export type GuardDecision = {
  allowed: boolean;
  code: GuardDecisionCode;
  reason: string;
  violations: string[];
};

export type ActionCandidateRanking = {
  tool_name: string;
  score: number;
  reason: string;
  missing_required_arguments: string[];
};

export type ActionProposal = {
  proposal_id: string;
  selected_tool: string;
  selected_reason: string;
  guard_decision: GuardDecisionCode;
  guard_failure_reason?: string;
  selector_score: number;
  candidate_rankings: ActionCandidateRanking[];
  repair_strategy_id?: string;
  attempt_index: number;
  previous_attempt_ref?: string;
};

export type ActionCandidate = {
  tool_name: string;
  rationale: string;
  required_argument_names: string[];
  provided_argument_names: string[];
  domain_match_score?: number;
  reliability_score?: number;
  risk_score?: number;
};
