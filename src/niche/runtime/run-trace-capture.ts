import type { ActionProposal, ActionCandidate, GuardDecision } from "../action-policy/index.js";
import type {
  DomainPack,
  EvidenceBundleRef,
  SourceAccessManifest,
} from "../schema/index.js";
import type { VerifierDecision, VerifierPackConfig } from "../verifier/index.js";

export type NicheActionPolicyRuntimeConfig = {
  allowedTools: string[];
  requiredArgumentsByTool?: Record<string, string[]>;
  permissionDeniedTools?: string[];
  domainConstraintViolationsByTool?: Record<string, string[]>;
  releaseConstraintViolationsByTool?: Record<string, string[]>;
  scoringByTool?: Record<
    string,
    {
      rationale?: string;
      domainMatchScore?: number;
      reliabilityScore?: number;
      riskScore?: number;
    }
  >;
  maxRepairAttempts?: number;
  maxRetryAttempts?: number;
};

export type NicheToolTraceEvent = {
  phase: "start" | "update" | "result";
  toolCallId: string;
  toolName: string;
  meta?: string;
  argsSummary?: string;
  partialSummary?: string;
  resultSummary?: string;
  isError?: boolean;
};

export type NicheRunTraceContext = {
  runId: string;
  nicheProgramId: string;
  domainPackId: string;
  baselineOrCandidateManifestId: string;
  benchmarkSuiteId?: string;
  benchmarkArmId?: string;
  benchmarkCaseId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  domainPack?: DomainPack;
  sourceAccessManifest?: SourceAccessManifest;
  evidenceBundleRefs?: EvidenceBundleRef[];
  verifierPackConfig?: VerifierPackConfig;
  actionPolicy: NicheActionPolicyRuntimeConfig;
  actionProposals: ActionProposal[];
  guardDecisions: GuardDecision[];
  toolEvents: NicheToolTraceEvent[];
  verifierDecisions: VerifierDecision[];
};

const nicheRunTraceContexts = new Map<string, NicheRunTraceContext>();

function summarizeValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.slice(0, 200);
  }
  try {
    return JSON.stringify(value).slice(0, 200);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export function registerNicheRunTraceContext(
  context: Omit<NicheRunTraceContext, "actionProposals" | "guardDecisions" | "toolEvents">,
): void {
  nicheRunTraceContexts.set(context.runId, {
    ...context,
    actionProposals: [],
    guardDecisions: [],
    toolEvents: [],
    verifierDecisions: [],
  });
}

export function hasNicheRunTraceContext(runId: string): boolean {
  return nicheRunTraceContexts.has(runId);
}

export function getNicheRunTraceContext(runId: string): NicheRunTraceContext | undefined {
  return nicheRunTraceContexts.get(runId);
}

export function attachNicheRunAttemptMetadata(params: {
  runId: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
}): void {
  const existing = nicheRunTraceContexts.get(params.runId);
  if (!existing) {
    return;
  }
  nicheRunTraceContexts.set(params.runId, {
    ...existing,
    sessionId: params.sessionId ?? existing.sessionId,
    sessionKey: params.sessionKey ?? existing.sessionKey,
    agentId: params.agentId ?? existing.agentId,
    provider: params.provider ?? existing.provider,
    modelId: params.modelId ?? existing.modelId,
  });
}

export function clearNicheRunTraceContext(runId: string): void {
  nicheRunTraceContexts.delete(runId);
}

export function clearAllNicheRunTraceContextsForTest(): void {
  nicheRunTraceContexts.clear();
}

export function recordActionProposalForRun(
  runId: string,
  guardDecision: GuardDecision,
  proposal: ActionProposal,
): void {
  const existing = nicheRunTraceContexts.get(runId);
  if (!existing) {
    return;
  }
  existing.guardDecisions.push(guardDecision);
  existing.actionProposals.push(proposal);
}

export function recordVerifierDecisionForRun(
  runId: string,
  decision: VerifierDecision,
): void {
  const existing = nicheRunTraceContexts.get(runId);
  if (!existing) {
    return;
  }
  existing.verifierDecisions.push(decision);
}

export function buildActionCandidatesForTool(params: {
  toolName: string;
  rawParams: unknown;
  context: NicheRunTraceContext;
}): ActionCandidate[] {
  const providedArgumentNames =
    params.rawParams && typeof params.rawParams === "object"
      ? Object.keys(params.rawParams as Record<string, unknown>).toSorted((left, right) =>
          left.localeCompare(right),
        )
      : [];
  const scoreConfig = params.context.actionPolicy.scoringByTool?.[params.toolName];

  return [
    {
      tool_name: params.toolName,
      rationale:
        scoreConfig?.rationale ??
        `Use ${params.toolName} within the approved NicheClaw action policy.`,
      required_argument_names:
        params.context.actionPolicy.requiredArgumentsByTool?.[params.toolName] ?? [],
      provided_argument_names: providedArgumentNames,
      domain_match_score: scoreConfig?.domainMatchScore ?? 1,
      reliability_score: scoreConfig?.reliabilityScore ?? 0.5,
      risk_score: scoreConfig?.riskScore ?? 0,
    },
  ];
}

export function recordToolExecutionStart(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  meta?: string;
  args: unknown;
}): void {
  const existing = nicheRunTraceContexts.get(params.runId);
  if (!existing) {
    return;
  }
  existing.toolEvents.push({
    phase: "start",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    meta: params.meta,
    argsSummary: summarizeValue(params.args),
  });
}

export function recordToolExecutionUpdate(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  partialResult: unknown;
}): void {
  const existing = nicheRunTraceContexts.get(params.runId);
  if (!existing) {
    return;
  }
  existing.toolEvents.push({
    phase: "update",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    partialSummary: summarizeValue(params.partialResult),
  });
}

export function recordToolExecutionResult(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  meta?: string;
  result: unknown;
  isError: boolean;
}): void {
  const existing = nicheRunTraceContexts.get(params.runId);
  if (!existing) {
    return;
  }
  existing.toolEvents.push({
    phase: "result",
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    meta: params.meta,
    resultSummary: summarizeValue(params.result),
    isError: params.isError,
  });
}

export function snapshotNicheRunTraceContext(
  runId: string,
): NicheRunTraceContext | undefined {
  const existing = nicheRunTraceContexts.get(runId);
  if (!existing) {
    return undefined;
  }
  return structuredClone(existing);
}
