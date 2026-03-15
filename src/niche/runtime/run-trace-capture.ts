import type { ActionCandidate, ActionProposal, GuardDecision } from "../action-policy/index.js";
import type { CompiledDomainConfig } from "../domain/compiled-config.js";
import { compileDomainConfig } from "../domain/compiled-config.js";
import type {
  BenchmarkCaseReference,
  DomainPack,
  EvidenceBundleRef,
  NicheStackReleaseMode,
  NicheStackResolutionSource,
  PreparedNicheRunSeed,
  SourceAccessManifest,
} from "../schema/index.js";
import type { VerifierDecision, VerifierPackConfig } from "../verifier/index.js";
import { emitNicheLifecycleEvent } from "./lifecycle-events.js";

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
  recordedAt: string;
  meta?: string;
  argsSummary?: string;
  partialSummary?: string;
  resultSummary?: string;
  isError?: boolean;
};

export type NicheRunTracePhaseState = {
  plannerStartedAt?: string;
  plannerFinishedAt?: string;
  actionProposalStartedAt?: string;
  actionProposalFinishedAt?: string;
  toolExecutionStartedAt?: string;
  toolExecutionFinishedAt?: string;
  verifierStartedAt?: string;
  verifierFinishedAt?: string;
  finalEmissionAt?: string;
  tracePersistedAt?: string;
};

export type NicheRunTraceContext = {
  runId: string;
  nicheProgramId: string;
  domainPackId: string;
  baselineOrCandidateManifestId: string;
  benchmarkSuiteId?: string;
  benchmarkArmId?: string;
  benchmarkCaseId?: string;
  benchmarkCaseRef?: BenchmarkCaseReference;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  activeStackId?: string;
  resolvedStackSource?: NicheStackResolutionSource;
  resolvedReleaseMode?: NicheStackReleaseMode;
  domainPack?: DomainPack;
  sourceAccessManifest?: SourceAccessManifest;
  evidenceBundleRefs?: EvidenceBundleRef[];
  verifierPackConfig?: VerifierPackConfig;
  actionPolicy: NicheActionPolicyRuntimeConfig;
  compiledDomainConfig?: CompiledDomainConfig;
  preparedSeed?: PreparedNicheRunSeed;
  phaseState: NicheRunTracePhaseState;
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

function withContext(runId: string, update: (context: NicheRunTraceContext) => void): void {
  const context = nicheRunTraceContexts.get(runId);
  if (!context) {
    return;
  }
  update(context);
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveLifecycleManifestIds(context: NicheRunTraceContext): {
  baseline_manifest_id?: string;
  candidate_manifest_id?: string;
} {
  if (context.preparedSeed?.manifest_kind === "baseline") {
    return {
      baseline_manifest_id: context.baselineOrCandidateManifestId,
    };
  }
  return {
    candidate_manifest_id: context.baselineOrCandidateManifestId,
  };
}

function buildLifecycleHookContext(context: NicheRunTraceContext) {
  return {
    agentId: context.agentId,
    sessionId: context.sessionId,
    sessionKey: context.sessionKey,
  };
}

function mapPreparedActionPolicy(seed: PreparedNicheRunSeed): NicheActionPolicyRuntimeConfig {
  return {
    allowedTools: [...seed.action_policy_runtime.allowed_tools],
    requiredArgumentsByTool: seed.action_policy_runtime.required_arguments_by_tool
      ? structuredClone(seed.action_policy_runtime.required_arguments_by_tool)
      : undefined,
    permissionDeniedTools: seed.action_policy_runtime.permission_denied_tools
      ? [...seed.action_policy_runtime.permission_denied_tools]
      : undefined,
    domainConstraintViolationsByTool: seed.action_policy_runtime
      .domain_constraint_violations_by_tool
      ? structuredClone(seed.action_policy_runtime.domain_constraint_violations_by_tool)
      : undefined,
    releaseConstraintViolationsByTool: seed.action_policy_runtime
      .release_constraint_violations_by_tool
      ? structuredClone(seed.action_policy_runtime.release_constraint_violations_by_tool)
      : undefined,
    scoringByTool: seed.action_policy_runtime.scoring_by_tool
      ? Object.fromEntries(
          Object.entries(seed.action_policy_runtime.scoring_by_tool).map(([toolName, score]) => [
            toolName,
            {
              rationale: score.rationale,
              domainMatchScore: score.domain_match_score,
              reliabilityScore: score.reliability_score,
              riskScore: score.risk_score,
            },
          ]),
        )
      : undefined,
    maxRepairAttempts: seed.action_policy_runtime.max_repair_attempts,
    maxRetryAttempts: seed.action_policy_runtime.max_retry_attempts,
  };
}

export function registerNicheRunTraceContext(
  context: Omit<
    NicheRunTraceContext,
    "actionProposals" | "guardDecisions" | "toolEvents" | "verifierDecisions" | "phaseState"
  >,
): void {
  nicheRunTraceContexts.set(context.runId, {
    ...context,
    actionProposals: [],
    guardDecisions: [],
    toolEvents: [],
    verifierDecisions: [],
    phaseState: {},
  });
}

export function registerPreparedNicheRunTraceContext(params: {
  runId: string;
  seed: PreparedNicheRunSeed;
}): void {
  const activatedAt = nowIso();
  registerNicheRunTraceContext({
    runId: params.runId,
    nicheProgramId: params.seed.niche_program_id,
    domainPackId: params.seed.domain_pack_id,
    baselineOrCandidateManifestId: params.seed.baseline_or_candidate_manifest_id,
    benchmarkSuiteId: params.seed.benchmark_suite_id,
    benchmarkArmId: params.seed.benchmark_arm_id,
    benchmarkCaseRef: params.seed.benchmark_case_ref,
    domainPack: params.seed.domain_pack,
    sourceAccessManifest: params.seed.source_access_manifest,
    evidenceBundleRefs: params.seed.evidence_bundle_refs,
    verifierPackConfig: params.seed.verifier_pack_config,
    actionPolicy: mapPreparedActionPolicy(params.seed),
    activeStackId: params.seed.active_stack_id,
    resolvedStackSource: params.seed.resolution_source,
    resolvedReleaseMode: params.seed.resolved_release_mode,
    preparedSeed: structuredClone(params.seed),
  });
  withContext(params.runId, (context) => {
    context.compiledDomainConfig = compileDomainConfig(params.seed.domain_pack);
    context.phaseState.plannerStartedAt = activatedAt;
    context.phaseState.plannerFinishedAt = activatedAt;
    void emitNicheLifecycleEvent({
      event_type: "planner_proposed",
      occurred_at: activatedAt,
      run_id: params.runId,
      niche_program_id: context.nicheProgramId,
      ...resolveLifecycleManifestIds(context),
      payload: {
        selected_manifest_id: context.baselineOrCandidateManifestId,
        planner_runtime_component_id: params.seed.planner_version_id,
        benchmark_suite_id: params.seed.benchmark_suite_id,
        active_stack_id: params.seed.active_stack_id,
        resolution_source: params.seed.resolution_source,
        resolved_release_mode: params.seed.resolved_release_mode,
      },
      ctx: buildLifecycleHookContext(context),
    });
  });
}

export function hasNicheRunTraceContext(runId: string): boolean {
  return nicheRunTraceContexts.has(runId);
}

export function getNicheRunTraceContext(runId: string): NicheRunTraceContext | undefined {
  return nicheRunTraceContexts.get(runId);
}

export function getCompiledDomainConfig(runId: string): CompiledDomainConfig | undefined {
  return nicheRunTraceContexts.get(runId)?.compiledDomainConfig;
}

export function attachNicheRunAttemptMetadata(params: {
  runId: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  provider?: string;
  modelId?: string;
  activeStackId?: string;
  resolvedStackSource?: NicheStackResolutionSource;
  resolvedReleaseMode?: NicheStackReleaseMode;
}): void {
  withContext(params.runId, (context) => {
    context.sessionId = params.sessionId ?? context.sessionId;
    context.sessionKey = params.sessionKey ?? context.sessionKey;
    context.agentId = params.agentId ?? context.agentId;
    context.provider = params.provider ?? context.provider;
    context.modelId = params.modelId ?? context.modelId;
    context.activeStackId = params.activeStackId ?? context.activeStackId;
    context.resolvedStackSource = params.resolvedStackSource ?? context.resolvedStackSource;
    context.resolvedReleaseMode = params.resolvedReleaseMode ?? context.resolvedReleaseMode;
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
  const recordedAt = nowIso();
  withContext(runId, (context) => {
    context.guardDecisions.push(guardDecision);
    context.actionProposals.push(proposal);
    context.phaseState.actionProposalStartedAt ??= recordedAt;
    context.phaseState.actionProposalFinishedAt = recordedAt;
    void emitNicheLifecycleEvent({
      event_type: "action_proposed",
      occurred_at: recordedAt,
      run_id: runId,
      niche_program_id: context.nicheProgramId,
      ...resolveLifecycleManifestIds(context),
      payload: {
        proposal_id: proposal.proposal_id,
        run_id: runId,
        niche_program_id: context.nicheProgramId,
        selected_tool: proposal.selected_tool,
        selected_reason: proposal.selected_reason,
        guard_decision: proposal.guard_decision,
        guard_failure_reason: proposal.guard_failure_reason,
        selector_score: proposal.selector_score,
        candidate_rankings:
          proposal.candidate_rankings.length > 0
            ? proposal.candidate_rankings.map((ranking) => ({
                tool_name: ranking.tool_name,
                score: ranking.score,
                reason: ranking.reason,
              }))
            : [
                {
                  tool_name: proposal.selected_tool,
                  score: proposal.selector_score,
                  reason: proposal.selected_reason,
                },
              ],
        repair_strategy_id: proposal.repair_strategy_id,
        attempt_index: proposal.attempt_index,
        previous_attempt_ref: proposal.previous_attempt_ref,
      },
      ctx: buildLifecycleHookContext(context),
    });
    void emitNicheLifecycleEvent({
      event_type: "action_validated",
      occurred_at: recordedAt,
      run_id: runId,
      niche_program_id: context.nicheProgramId,
      ...resolveLifecycleManifestIds(context),
      payload: {
        proposal_id: proposal.proposal_id,
        guard_decision: guardDecision.code,
        ready_for_execution: guardDecision.allowed,
        repair_strategy_id: proposal.repair_strategy_id,
      },
      ctx: buildLifecycleHookContext(context),
    });
  });
}

export function recordVerifierDecisionForRun(runId: string, decision: VerifierDecision): void {
  withContext(runId, (context) => {
    context.verifierDecisions.push(decision);
    void emitNicheLifecycleEvent({
      event_type: "verifier_decision",
      occurred_at: nowIso(),
      run_id: runId,
      niche_program_id: context.nicheProgramId,
      ...resolveLifecycleManifestIds(context),
      payload: {
        decision_id: decision.decision_id,
        outcome: decision.outcome,
        rationale: decision.rationale,
        findings: decision.findings.map((finding) => ({
          finding_id: finding.finding_id,
          severity: finding.severity,
          message: finding.message,
        })),
      },
      ctx: buildLifecycleHookContext(context),
    });
  });
}

export function markNicheVerifierPhaseStarted(runId: string, startedAt: string): void {
  withContext(runId, (context) => {
    context.phaseState.verifierStartedAt = startedAt;
  });
}

export function markNicheVerifierPhaseFinished(runId: string, finishedAt: string): void {
  withContext(runId, (context) => {
    context.phaseState.verifierFinishedAt = finishedAt;
  });
}

export function markNicheFinalEmission(runId: string, emittedAt: string): void {
  withContext(runId, (context) => {
    context.phaseState.finalEmissionAt = emittedAt;
  });
}

export function markNicheTracePersisted(runId: string, persistedAt: string): void {
  withContext(runId, (context) => {
    context.phaseState.tracePersistedAt = persistedAt;
  });
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
  const recordedAt = nowIso();
  withContext(params.runId, (context) => {
    context.toolEvents.push({
      phase: "start",
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      recordedAt,
      meta: params.meta,
      argsSummary: summarizeValue(params.args),
    });
    context.phaseState.toolExecutionStartedAt ??= recordedAt;
  });
}

export function recordToolExecutionUpdate(params: {
  runId: string;
  toolCallId: string;
  toolName: string;
  partialResult: unknown;
}): void {
  const recordedAt = nowIso();
  withContext(params.runId, (context) => {
    context.toolEvents.push({
      phase: "update",
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      recordedAt,
      partialSummary: summarizeValue(params.partialResult),
    });
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
  const recordedAt = nowIso();
  withContext(params.runId, (context) => {
    context.toolEvents.push({
      phase: "result",
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      recordedAt,
      meta: params.meta,
      resultSummary: summarizeValue(params.result),
      isError: params.isError,
    });
    context.phaseState.toolExecutionFinishedAt = recordedAt;
  });
}

export function snapshotNicheRunTraceContext(runId: string): NicheRunTraceContext | undefined {
  const existing = nicheRunTraceContexts.get(runId);
  if (!existing) {
    return undefined;
  }
  return structuredClone(existing);
}
