import { computeStableContentHash } from "../benchmark/index.js";
import type { SpecializationLane } from "../schema/index.js";
import type { RefreshTriggerSummary } from "./drift-signals.js";
import { evaluateRefreshEligibility, type RefreshTraceCandidate } from "./refresh-policy.js";

export type FailureCluster = {
  cluster_id: string;
  task_family: string;
  failure_labels: string[];
  trace_ids: string[];
  priority_score: number;
};

export type CandidateRefreshPlan = {
  plan_id: string;
  created_at: string;
  status: "planned" | "blocked";
  selected_lane: Extract<SpecializationLane, "distillation" | "system_specialization">;
  reasons: string[];
  selected_trace_ids: string[];
  blocked_trace_ids: string[];
  failure_clusters: FailureCluster[];
};

function buildFailureClusters(traces: RefreshTraceCandidate[]): FailureCluster[] {
  const clusters = new Map<string, FailureCluster>();

  for (const trace of traces) {
    const failureLabels = [...trace.failure_labels].toSorted((left, right) =>
      left.localeCompare(right),
    );
    const clusterKey = `${trace.task_family}::${failureLabels.join(",")}`;
    const existing = clusters.get(clusterKey) ?? {
      cluster_id: computeStableContentHash({
        taskFamily: trace.task_family,
        failureLabels,
      }),
      task_family: trace.task_family,
      failure_labels: failureLabels,
      trace_ids: [],
      priority_score: 0,
    };
    existing.trace_ids.push(trace.trace_ref.artifact_id);
    existing.priority_score =
      existing.trace_ids.length * (failureLabels.includes("hard_fail") ? 2 : 1);
    clusters.set(clusterKey, existing);
  }

  return [...clusters.values()].toSorted((left, right) => {
    if (right.priority_score !== left.priority_score) {
      return right.priority_score - left.priority_score;
    }
    return left.cluster_id.localeCompare(right.cluster_id);
  });
}

export function planContinuousOptimizationLoop(params: {
  createdAt: string;
  driftTrigger: RefreshTriggerSummary;
  traces: RefreshTraceCandidate[];
  selectedLane: Extract<SpecializationLane, "distillation" | "system_specialization">;
  maxSelectedTraces?: number;
}): CandidateRefreshPlan {
  const eligibleTraces: RefreshTraceCandidate[] = [];
  const blockedTraceIds: string[] = [];
  const rejectionReasons: string[] = [];

  for (const trace of [...params.traces].toSorted((left, right) =>
    left.trace_ref.artifact_id.localeCompare(right.trace_ref.artifact_id),
  )) {
    const eligibility = evaluateRefreshEligibility(trace);
    if (eligibility.allowed) {
      eligibleTraces.push(trace);
    } else {
      blockedTraceIds.push(trace.trace_ref.artifact_id);
      rejectionReasons.push(...eligibility.reasons);
    }
  }

  if (!params.driftTrigger.warranted) {
    return {
      plan_id: computeStableContentHash({
        createdAt: params.createdAt,
        reason: "no-refresh-warranted",
      }),
      created_at: params.createdAt,
      status: "blocked",
      selected_lane: params.selectedLane,
      reasons: ["No refresh plan is warranted by current drift signals."],
      selected_trace_ids: [],
      blocked_trace_ids: blockedTraceIds,
      failure_clusters: [],
    };
  }

  if (eligibleTraces.length === 0) {
    return {
      plan_id: computeStableContentHash({
        createdAt: params.createdAt,
        reason: "no-eligible-traces",
      }),
      created_at: params.createdAt,
      status: "blocked",
      selected_lane: params.selectedLane,
      reasons: [...params.driftTrigger.reasons, ...new Set(rejectionReasons)],
      selected_trace_ids: [],
      blocked_trace_ids: blockedTraceIds,
      failure_clusters: [],
    };
  }

  const failureClusters = buildFailureClusters(eligibleTraces);
  const selectedTraceIds = failureClusters
    .flatMap((cluster) => cluster.trace_ids)
    .slice(0, params.maxSelectedTraces ?? eligibleTraces.length);

  return {
    plan_id: computeStableContentHash({
      createdAt: params.createdAt,
      selectedTraceIds,
      selectedLane: params.selectedLane,
      reasons: params.driftTrigger.reasons,
    }),
    created_at: params.createdAt,
    status: "planned",
    selected_lane: params.selectedLane,
    reasons: [...params.driftTrigger.reasons],
    selected_trace_ids: selectedTraceIds,
    blocked_trace_ids: blockedTraceIds,
    failure_clusters: failureClusters,
  };
}
