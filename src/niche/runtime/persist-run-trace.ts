import type { EmbeddedPiRunMeta } from "../../agents/pi-embedded.js";
import { loadConfig } from "../../config/config.js";
import { estimateUsageCost, resolveModelCostConfig } from "../../utils/usage-format.js";
import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import type {
  FinalOutputRecord,
  ObservationRecord,
  PreparedNicheRunSeed,
  RunTrace,
  SuppressedOutputRecord,
  TerminalRunStatus,
  ToolCallRecord,
  ToolCallStatus,
  TracePhaseTimestamps,
  UsageSummary,
  VerifierDecisionRecord,
} from "../schema/index.js";
import { createReplayBundle } from "../store/replay-bundle.js";
import { appendRunTrace } from "../store/trace-store.js";
import { toRunTraceVerifierDecisionRecord } from "../verifier/pack.js";
import { emitNicheLifecycleEvent } from "./lifecycle-events.js";
import { assertPreparedNicheRunSeed } from "./prepare-run-seed.js";
import {
  clearNicheRunTraceContext,
  markNicheTracePersisted,
  snapshotNicheRunTraceContext,
} from "./run-trace-capture.js";

export type PersistPreparedNicheRunArtifactsParams = {
  runId: string;
  nicheRunSeed: PreparedNicheRunSeed;
  sessionId: string;
  sessionKey?: string;
  transcriptPath?: string;
  resultMeta: EmbeddedPiRunMeta;
  deliveredPayloads: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    isError?: boolean;
  }>;
  originalPayloads?: Array<{
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    isError?: boolean;
  }>;
  suppressedOriginalOutput?: boolean;
  emittedToUser: boolean;
  deliveredAt: string;
  env?: NodeJS.ProcessEnv;
};

type PersistPreparedNicheRunPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  isError?: boolean;
};

export type PersistPreparedNicheRunFailureArtifactsParams = {
  runId: string;
  nicheRunSeed: PreparedNicheRunSeed;
  sessionId: string;
  sessionKey?: string;
  transcriptPath?: string;
  resultMeta: EmbeddedPiRunMeta;
  deliveredPayloads?: PersistPreparedNicheRunPayload[];
  originalPayloads?: PersistPreparedNicheRunPayload[];
  suppressedOriginalOutput?: boolean;
  terminal_status: Extract<TerminalRunStatus, "failed" | "aborted">;
  failure_labels?: string[];
  deliveredAt: string;
  env?: NodeJS.ProcessEnv;
};

export type PersistPreparedNicheRunArtifactsResult = {
  trace_id: string;
  trace_path: string;
  replay_bundle_id?: string;
  replay_bundle_path?: string;
};

type ToolCallAccumulator = {
  tool_call_id: string;
  tool_name: string;
  arguments_summary?: string;
  output_summary?: string;
  error_summary?: string;
  status: ToolCallStatus;
};

type PersistPreparedNicheRunTraceParams = {
  runId: string;
  nicheRunSeed: PreparedNicheRunSeed;
  sessionId: string;
  sessionKey?: string;
  transcriptPath?: string;
  resultMeta: EmbeddedPiRunMeta;
  deliveredPayloads: PersistPreparedNicheRunPayload[];
  originalPayloads?: PersistPreparedNicheRunPayload[];
  suppressedOriginalOutput?: boolean;
  emittedToUser: boolean;
  deliveredAt: string;
  terminalStatusOverride?: Extract<TerminalRunStatus, "failed" | "aborted">;
  additionalFailureLabels?: string[];
  env?: NodeJS.ProcessEnv;
};

type UsageSummaryResolution = {
  usage?: UsageSummary;
  unavailableReason?: string;
};

type CostSummaryResolution = {
  cost?: RunTrace["cost"];
  unavailableReason?: string;
};

function requireValue<T>(value: T | undefined, label: string): T {
  if (value !== undefined) {
    return value;
  }
  throw new Error(`Cannot persist prepared Niche run trace without ${label}.`);
}

function isoDiffMs(startedAt: string, finishedAt: string, label: string): number {
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) {
    throw new Error(`Cannot persist prepared Niche run trace: invalid ${label} timestamp.`);
  }
  return Math.max(0, finishedMs - startedMs);
}

function resolveUsageSummary(params: {
  resultMeta: EmbeddedPiRunMeta;
  terminalStatus: TerminalRunStatus;
}): UsageSummaryResolution {
  const allowMissingUsage =
    params.terminalStatus === "failed" || params.terminalStatus === "aborted";
  const usage = params.resultMeta.agentMeta?.usage;
  if (!usage) {
    if (allowMissingUsage) {
      return {
        unavailableReason:
          params.terminalStatus === "aborted"
            ? "Run aborted before model usage was available."
            : "Run failed before model usage was available.",
      };
    }
    throw new Error("Cannot persist prepared Niche run trace without resultMeta.agentMeta.usage.");
  }
  const inputTokens = Math.max(0, Math.round(usage.input ?? 0));
  const outputTokens = Math.max(0, Math.round(usage.output ?? 0));
  const totalTokens = Math.max(
    0,
    Math.round(
      usage.total ??
        (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0),
    ),
  );
  return {
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    },
  };
}

function resolveCostSummary(params: {
  resultMeta: EmbeddedPiRunMeta;
  usage?: UsageSummary;
  terminalStatus: TerminalRunStatus;
}): CostSummaryResolution {
  if (!params.usage) {
    return {
      unavailableReason:
        params.terminalStatus === "aborted"
          ? "Run aborted before model cost was available."
          : "Run failed before model cost was available.",
    };
  }
  const agentMeta = params.resultMeta.agentMeta;
  if (!agentMeta?.provider || !agentMeta.model) {
    throw new Error(
      "Cannot persist prepared Niche run trace without resultMeta.agentMeta provider/model metadata.",
    );
  }
  const config = loadConfig();
  const cost = estimateUsageCost({
    usage: {
      input: params.usage.input_tokens,
      output: params.usage.output_tokens,
      total: params.usage.total_tokens,
      cacheRead: agentMeta.usage?.cacheRead,
      cacheWrite: agentMeta.usage?.cacheWrite,
    },
    cost: resolveModelCostConfig({
      provider: agentMeta.provider,
      model: agentMeta.model,
      config,
    }),
  });
  if (cost === undefined) {
    throw new Error(
      `Cannot persist prepared Niche run trace without a cost model for ${agentMeta.provider}/${agentMeta.model}.`,
    );
  }
  return {
    cost: {
      currency: "USD",
      total_cost: cost,
    },
  };
}

function buildTraceId(params: { runId: string; seedId: string }): string {
  return `run-trace-${computeStableContentHash(params).slice(0, 24)}`;
}

function buildReplayBundleId(params: { traceId: string; seedId: string }): string {
  return `replay-bundle-${computeStableContentHash(params).slice(0, 24)}`;
}

function summarizePlannerInput(seed: PreparedNicheRunSeed): string {
  return `Prepared seed ${seed.seed_id} activated ${seed.manifest_kind} manifest ${seed.baseline_or_candidate_manifest_id}.`;
}

function summarizePlannerOutput(seed: PreparedNicheRunSeed): string {
  return `Selected ${seed.mode} mode with planner ${seed.planner_version_id} and runtime snapshot ${seed.runtime_snapshot_id}.`;
}

function buildToolCalls(
  toolEvents: NonNullable<ReturnType<typeof snapshotNicheRunTraceContext>>["toolEvents"],
): ToolCallRecord[] {
  const byId = new Map<string, ToolCallAccumulator>();
  for (const event of toolEvents) {
    const existing =
      byId.get(event.toolCallId) ??
      ({
        tool_call_id: event.toolCallId,
        tool_name: event.toolName,
        status: "started",
      } satisfies ToolCallAccumulator);
    existing.tool_name = event.toolName;
    if (event.phase === "start") {
      existing.arguments_summary ??= event.argsSummary;
      existing.status = "started";
    }
    if (event.phase === "update" && !existing.output_summary) {
      existing.output_summary = event.partialSummary;
    }
    if (event.phase === "result") {
      if (event.isError) {
        existing.status = "failed";
        existing.error_summary = event.resultSummary;
      } else {
        existing.status = "completed";
        existing.output_summary = event.resultSummary ?? existing.output_summary;
      }
    }
    byId.set(event.toolCallId, existing);
  }

  return [...byId.values()].map((entry) => ({
    tool_call_id: entry.tool_call_id,
    tool_name: entry.tool_name,
    status: entry.status,
    arguments_summary: entry.arguments_summary,
    output_summary: entry.output_summary,
    error_summary: entry.error_summary,
  }));
}

function buildObservations(seed: PreparedNicheRunSeed): ObservationRecord[] {
  return seed.evidence_bundle_refs.map((bundle, index) => ({
    observation_id: `observation-${index + 1}-${bundle.evidence_bundle_id}`,
    source: `evidence_bundle:${bundle.evidence_bundle_id}`,
    summary: bundle.delivered_evidence.join(" | "),
  }));
}

function summarizePayloadOutput(params: {
  deliveredPayloads: PersistPreparedNicheRunArtifactsParams["deliveredPayloads"];
  emittedToUser: boolean;
}): FinalOutputRecord | null {
  const textParts = params.deliveredPayloads
    .map((payload) => payload.text?.trim())
    .filter((value): value is string => Boolean(value));
  const mediaParts = params.deliveredPayloads.flatMap((payload) => {
    const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
    return mediaUrls.map((entry) => entry.trim()).filter(Boolean);
  });
  const summaryParts = [...textParts, ...mediaParts.map((entry) => `MEDIA:${entry}`)];
  const contentSummary = summaryParts.join("\n").trim();
  if (!contentSummary) {
    return null;
  }
  const hasText = textParts.length > 0;
  const hasMedia = mediaParts.length > 0;
  return {
    output_id: `final-output-${computeStableContentHash(summaryParts).slice(0, 16)}`,
    output_type: hasText && hasMedia ? "mixed" : hasMedia ? "media" : "text",
    content_summary: contentSummary,
    emitted_to_user: params.emittedToUser,
  };
}

function resolvePhaseTimestamps(params: {
  context: NonNullable<ReturnType<typeof snapshotNicheRunTraceContext>>;
  deliveredAt: string;
  persistedAt: string;
}): TracePhaseTimestamps {
  const phaseState = params.context.phaseState;
  const plannerStartedAt = requireValue(
    phaseState.plannerStartedAt,
    "planner_started_at phase timing",
  );
  const plannerFinishedAt = phaseState.plannerFinishedAt ?? plannerStartedAt;
  const actionProposalStartedAt = phaseState.actionProposalStartedAt ?? plannerFinishedAt;
  const actionProposalFinishedAt = phaseState.actionProposalFinishedAt ?? actionProposalStartedAt;
  const toolExecutionStartedAt = phaseState.toolExecutionStartedAt ?? actionProposalFinishedAt;
  const toolExecutionFinishedAt = phaseState.toolExecutionFinishedAt ?? toolExecutionStartedAt;
  const verifierStartedAt = phaseState.verifierStartedAt ?? toolExecutionFinishedAt;
  const verifierFinishedAt = phaseState.verifierFinishedAt ?? verifierStartedAt;
  const finalEmissionAt = phaseState.finalEmissionAt ?? params.deliveredAt;
  return {
    planner_started_at: plannerStartedAt,
    planner_finished_at: plannerFinishedAt,
    action_proposal_started_at: actionProposalStartedAt,
    action_proposal_finished_at: actionProposalFinishedAt,
    tool_execution_started_at: toolExecutionStartedAt,
    tool_execution_finished_at: toolExecutionFinishedAt,
    verifier_started_at: verifierStartedAt,
    verifier_finished_at: verifierFinishedAt,
    final_emission_at: finalEmissionAt,
    trace_persisted_at: params.persistedAt,
  };
}

function buildFailureLabels(params: {
  resultMeta: EmbeddedPiRunMeta;
  terminalStatus: TerminalRunStatus;
  toolCalls: ToolCallRecord[];
  verifierDecisions: VerifierDecisionRecord[];
  additionalFailureLabels?: string[];
}): string[] {
  const labels = new Set<string>();
  if (params.resultMeta.aborted || params.terminalStatus === "aborted") {
    labels.add("aborted");
  }
  if (params.resultMeta.error?.kind) {
    labels.add(params.resultMeta.error.kind);
  }
  if (params.toolCalls.some((entry) => entry.status === "failed")) {
    labels.add("tool_failed");
  }
  for (const decision of params.verifierDecisions) {
    if (decision.outcome !== "approved") {
      labels.add(`verifier_${decision.outcome}`);
    }
  }
  if (params.terminalStatus === "failed") {
    labels.add("failed");
  }
  for (const label of params.additionalFailureLabels ?? []) {
    if (label.trim()) {
      labels.add(label.trim());
    }
  }
  return [...labels].toSorted((left, right) => left.localeCompare(right));
}

function summarizeSuppressedOutput(params: {
  originalPayloads: PersistPreparedNicheRunArtifactsParams["originalPayloads"];
  suppressedOriginalOutput: boolean;
}): SuppressedOutputRecord | undefined {
  if (!params.suppressedOriginalOutput || !params.originalPayloads) {
    return undefined;
  }
  const output = summarizePayloadOutput({
    deliveredPayloads: params.originalPayloads,
    emittedToUser: false,
  });
  if (!output) {
    return undefined;
  }
  return {
    content_summary: output.content_summary,
    suppression_reason: "Verifier gate replaced the original candidate output before delivery.",
  };
}

function resolveTerminalStatus(params: {
  resultMeta: EmbeddedPiRunMeta;
  finalOutput: FinalOutputRecord | null;
  suppressedOutput: SuppressedOutputRecord | undefined;
  terminalStatusOverride?: Extract<TerminalRunStatus, "failed" | "aborted">;
}): TerminalRunStatus {
  if (params.terminalStatusOverride) {
    return params.terminalStatusOverride;
  }
  if (params.resultMeta.aborted) {
    return "aborted";
  }
  if (params.resultMeta.error?.kind) {
    return "failed";
  }
  if (params.suppressedOutput) {
    return "withheld";
  }
  if (params.finalOutput) {
    return "delivered";
  }
  return "no_output";
}

function shouldCreateReplayBundle(seed: PreparedNicheRunSeed): boolean {
  return (
    seed.replayability_status !== "non_replayable" &&
    Boolean(
      seed.benchmark_suite_id &&
      seed.suite_hash &&
      seed.fixture_version &&
      seed.environment_snapshot &&
      seed.determinism_policy_id &&
      seed.context_bundle_id &&
      seed.runtime_snapshot_id &&
      seed.evidence_bundle_refs.length > 0,
    )
  );
}

function persistPreparedNicheRunTrace(
  params: PersistPreparedNicheRunTraceParams,
): PersistPreparedNicheRunArtifactsResult | null {
  const seed = assertPreparedNicheRunSeed(params.nicheRunSeed);
  try {
    const persistedAt = new Date().toISOString();

    const context = snapshotNicheRunTraceContext(params.runId);
    if (!context) {
      throw new Error(
        `Cannot persist prepared Niche run artifacts: no run-trace context is registered for ${params.runId}.`,
      );
    }

    const finalOutput = summarizePayloadOutput({
      deliveredPayloads: params.deliveredPayloads,
      emittedToUser: params.emittedToUser,
    });
    const suppressedOutput = summarizeSuppressedOutput({
      originalPayloads: params.originalPayloads,
      suppressedOriginalOutput: params.suppressedOriginalOutput === true,
    });
    const terminalStatus = resolveTerminalStatus({
      resultMeta: params.resultMeta,
      finalOutput,
      suppressedOutput,
      terminalStatusOverride: params.terminalStatusOverride,
    });

    const phaseTimestamps = resolvePhaseTimestamps({
      context,
      deliveredAt: params.deliveredAt,
      persistedAt,
    });
    const usageResolution = resolveUsageSummary({
      resultMeta: params.resultMeta,
      terminalStatus,
    });
    const costResolution = resolveCostSummary({
      resultMeta: params.resultMeta,
      usage: usageResolution.usage,
      terminalStatus,
    });
    const toolCalls = buildToolCalls(context.toolEvents);
    const verifierDecisions = context.verifierDecisions.map((entry) =>
      toRunTraceVerifierDecisionRecord(entry),
    );
    const traceId = buildTraceId({
      runId: params.runId,
      seedId: seed.seed_id,
    });
    const trace: RunTrace = {
      trace_id: traceId,
      run_id: params.runId,
      niche_program_id: seed.niche_program_id,
      domain_pack_id: seed.domain_pack_id,
      mode: seed.mode,
      session_ref: {
        session_id: params.sessionId,
        transcript_path: params.transcriptPath,
        route: params.sessionKey ? "cli_session" : "cli",
      },
      planner_inputs: [
        {
          stage_id: `planner-input-${seed.seed_id}`,
          summary: summarizePlannerInput(seed),
        },
      ],
      planner_outputs: [
        {
          stage_id: `planner-output-${seed.seed_id}`,
          summary: summarizePlannerOutput(seed),
        },
      ],
      action_proposals: context.actionProposals.map((proposal) => ({
        proposal_id: proposal.proposal_id,
        selected_tool: proposal.selected_tool,
        selected_reason: proposal.selected_reason,
        guard_decision: proposal.guard_decision,
        guard_failure_reason: proposal.guard_failure_reason,
        selector_score: proposal.selector_score,
        candidate_rankings: proposal.candidate_rankings.map((ranking) => ({
          tool_name: ranking.tool_name,
          score: ranking.score,
          reason: ranking.reason,
          missing_required_arguments: [...ranking.missing_required_arguments],
        })),
        repair_strategy_id: proposal.repair_strategy_id,
        attempt_index: proposal.attempt_index,
        previous_attempt_ref: proposal.previous_attempt_ref,
      })),
      tool_calls: toolCalls,
      observations: buildObservations(seed),
      verifier_decisions: verifierDecisions,
      terminal_status: terminalStatus,
      final_output: finalOutput ?? undefined,
      suppressed_output: suppressedOutput,
      usage: usageResolution.usage,
      usage_unavailable_reason: usageResolution.unavailableReason,
      latency: {
        planner_ms: isoDiffMs(
          phaseTimestamps.planner_started_at,
          phaseTimestamps.planner_finished_at,
          "planner",
        ),
        tool_ms: isoDiffMs(
          phaseTimestamps.tool_execution_started_at,
          phaseTimestamps.tool_execution_finished_at,
          "tool",
        ),
        verifier_ms: isoDiffMs(
          phaseTimestamps.verifier_started_at,
          phaseTimestamps.verifier_finished_at,
          "verifier",
        ),
        end_to_end_ms: isoDiffMs(
          phaseTimestamps.planner_started_at,
          params.deliveredAt,
          "end_to_end",
        ),
      },
      cost: costResolution.cost,
      cost_unavailable_reason: costResolution.unavailableReason,
      failure_labels: buildFailureLabels({
        resultMeta: params.resultMeta,
        terminalStatus,
        toolCalls,
        verifierDecisions,
        additionalFailureLabels: params.additionalFailureLabels,
      }),
      artifact_refs: seed.artifact_refs,
      baseline_or_candidate_manifest_id: seed.baseline_or_candidate_manifest_id,
      active_stack_id: seed.active_stack_id,
      resolved_stack_source: seed.resolution_source,
      resolved_release_mode: seed.resolved_release_mode,
      readiness_report_id: seed.readiness_report_id,
      planner_version_id: seed.planner_version_id,
      action_policy_version_id: seed.action_policy_version_id,
      verifier_pack_version_id: seed.verifier_pack_version_id,
      retrieval_stack_version_id: seed.retrieval_stack_version_id,
      grader_set_version_id: seed.grader_set_version_id,
      source_access_manifest_id: seed.source_access_manifest.source_access_manifest_id,
      runtime_snapshot_id: seed.runtime_snapshot_id,
      context_bundle_id: seed.context_bundle_id,
      evidence_bundle_refs: seed.evidence_bundle_refs,
      benchmark_arm_ref: seed.benchmark_arm_id
        ? { benchmark_arm_id: seed.benchmark_arm_id }
        : undefined,
      benchmark_case_ref: seed.benchmark_case_ref,
      determinism_policy_id: seed.determinism_policy_id,
      random_seed: seed.random_seed,
      phase_timestamps: phaseTimestamps,
      wall_clock_start_at: phaseTimestamps.planner_started_at,
      wall_clock_end_at: params.deliveredAt,
      replayability_status: seed.replayability_status,
      determinism_notes: seed.determinism_notes,
    };

    const tracePath = appendRunTrace(trace, params.env);
    markNicheTracePersisted(params.runId, persistedAt);
    void emitNicheLifecycleEvent({
      event_type: "run_trace_persisted",
      occurred_at: persistedAt,
      run_id: params.runId,
      niche_program_id: seed.niche_program_id,
      baseline_manifest_id:
        seed.manifest_kind === "baseline" ? seed.baseline_or_candidate_manifest_id : undefined,
      candidate_manifest_id:
        seed.manifest_kind === "candidate" ? seed.baseline_or_candidate_manifest_id : undefined,
      payload: {
        trace_id: traceId,
        replayability_status: seed.replayability_status,
        persisted_path: tracePath,
      },
      ctx: {
        agentId: context.agentId,
        sessionId: context.sessionId,
        sessionKey: context.sessionKey,
        trigger: "niche",
      },
    });
    let replayBundleId: string | undefined;
    let replayBundlePath: string | undefined;
    if (shouldCreateReplayBundle(seed)) {
      replayBundleId = buildReplayBundleId({
        traceId,
        seedId: seed.seed_id,
      });
      replayBundlePath = createReplayBundle(
        {
          replay_bundle_id: replayBundleId,
          trace_id: traceId,
          context_bundle_id: seed.context_bundle_id,
          runtime_snapshot_id: seed.runtime_snapshot_id,
          determinism_policy_id: seed.determinism_policy_id,
          evidence_bundle_refs: seed.evidence_bundle_refs,
          benchmark_suite_id: seed.benchmark_suite_id!,
          suite_hash: seed.suite_hash!,
          fixture_version: seed.fixture_version!,
          environment_snapshot: seed.environment_snapshot!,
          replayability_status: seed.replayability_status,
          created_at: persistedAt,
        },
        params.env,
      );
    }

    return {
      trace_id: traceId,
      trace_path: tracePath,
      replay_bundle_id: replayBundleId,
      replay_bundle_path: replayBundlePath,
    };
  } finally {
    clearNicheRunTraceContext(params.runId);
  }
}

export function persistPreparedNicheRunArtifacts(
  params: PersistPreparedNicheRunArtifactsParams,
): PersistPreparedNicheRunArtifactsResult | null {
  return persistPreparedNicheRunTrace({
    ...params,
    deliveredPayloads: params.deliveredPayloads,
  });
}

export function persistPreparedNicheRunFailureArtifacts(
  params: PersistPreparedNicheRunFailureArtifactsParams,
): PersistPreparedNicheRunArtifactsResult | null {
  return persistPreparedNicheRunTrace({
    ...params,
    deliveredPayloads: params.deliveredPayloads ?? [],
    emittedToUser: false,
    terminalStatusOverride: params.terminal_status,
    additionalFailureLabels: params.failure_labels,
  });
}
