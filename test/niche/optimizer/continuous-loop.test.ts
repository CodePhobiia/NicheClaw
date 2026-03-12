import { describe, expect, it } from "vitest";
import type { ArtifactRef, ArtifactRightsState } from "../../../src/niche/schema/index.js";
import {
  buildRefreshTriggerSummary,
  planContinuousOptimizationLoop,
} from "../../../src/niche/optimizer/index.js";
import { createPromotedReleaseMonitorDefinition } from "../../../src/niche/release/index.js";
import type { VerifierMetricSummary } from "../../../src/niche/verifier/index.js";
import { computeStableContentHash } from "../../../src/niche/benchmark/index.js";

const FULL_RIGHTS: ArtifactRightsState = {
  rights_to_store: true,
  rights_to_train: true,
  rights_to_benchmark: true,
  rights_to_derive: true,
  rights_to_distill: true,
  rights_to_generate_synthetic_from: true,
};

function makeRef(
  artifactId: string,
  dataZoneRights: ArtifactRightsState = FULL_RIGHTS,
): ArtifactRef {
  return {
    artifact_id: artifactId,
    artifact_type: "run_trace",
    version: "2026.3.12",
    content_hash: computeStableContentHash({ artifactId }),
    rights_state: dataZoneRights,
    created_at: "2026-03-12T14:00:00.000Z",
  };
}

function makeVerifierMetrics(
  overrides: Partial<VerifierMetricSummary> = {},
): VerifierMetricSummary {
  return {
    sample_count: 50,
    true_positive_rate: 0.2,
    false_positive_rate: 0.04,
    false_veto_rate: 0.01,
    pass_through_rate: 0.75,
    override_rate: 0.03,
    mean_latency_added_ms: 30,
    mean_cost_added: 0.02,
    total_cost_added: 1,
    counts: {
      true_positive: 10,
      false_positive: 2,
      false_veto: 1,
      pass_through: 37,
      overrides: 2,
    },
    ...overrides,
  };
}

describe("continuous optimization planning", () => {
  it("creates a drift-triggered refresh plan and prioritizes repeated failure clusters", () => {
    const monitorDefinition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "candidate-release-v1",
      baselineManifestId: "baseline-manifest-v1",
      candidateManifestId: "candidate-manifest-v1",
      driftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      verifierDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      graderDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
    });
    const trigger = buildRefreshTriggerSummary({
      monitorDefinition,
      monitorAssessment: {
        should_rollback: false,
        cooldown_active: false,
        breached_dimensions: ["task_success_drift"],
        shadow_recheck_due_in_hours: 24,
      },
      verifierMetrics: makeVerifierMetrics({ false_veto_rate: 0.03 }),
      graderDisagreementRate: 0.01,
      sourceFreshnessDecay: 0.1,
    });

    const plan = planContinuousOptimizationLoop({
      createdAt: "2026-03-12T14:01:00.000Z",
      driftTrigger: trigger,
      selectedLane: "distillation",
      traces: [
        {
          trace_ref: makeRef("trace-1"),
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          task_family: "repo-ci-verification",
          failure_labels: ["hard_fail", "lint_failure"],
          contamination_detected: false,
        },
        {
          trace_ref: makeRef("trace-2"),
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          task_family: "repo-ci-verification",
          failure_labels: ["hard_fail", "lint_failure"],
          contamination_detected: false,
        },
        {
          trace_ref: makeRef("trace-3"),
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          task_family: "repo-navigation",
          failure_labels: ["tool_misuse"],
          contamination_detected: false,
        },
      ],
    });

    expect(trigger.warranted).toBe(true);
    expect(plan.status).toBe("planned");
    expect(plan.selected_trace_ids[0]).toBe("trace-1");
    expect(plan.failure_clusters[0]?.trace_ids).toEqual(["trace-1", "trace-2"]);
    expect(plan.failure_clusters[0]?.priority_score).toBeGreaterThan(
      plan.failure_clusters[1]?.priority_score ?? 0,
    );
  });

  it("blocks shadow-only traces that remain under embargo", () => {
    const monitorDefinition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "candidate-release-v1",
      baselineManifestId: "baseline-manifest-v1",
      candidateManifestId: "candidate-manifest-v1",
      driftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      verifierDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      graderDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
    });
    const trigger = buildRefreshTriggerSummary({
      monitorDefinition,
      monitorAssessment: {
        should_rollback: false,
        cooldown_active: false,
        breached_dimensions: ["task_family_drift"],
        shadow_recheck_due_in_hours: 24,
      },
      verifierMetrics: makeVerifierMetrics(),
      graderDisagreementRate: 0.01,
      sourceFreshnessDecay: 0.3,
    });

    const plan = planContinuousOptimizationLoop({
      createdAt: "2026-03-12T14:02:00.000Z",
      driftTrigger: trigger,
      selectedLane: "distillation",
      traces: [
        {
          trace_ref: makeRef("trace-shadow"),
          governed_data_status: {
            data_zone: "shadow_only",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          task_family: "repo-ci-verification",
          failure_labels: ["hard_fail"],
          contamination_detected: false,
          embargo_active: true,
          contamination_checked: false,
          rights_confirmed: false,
          evaluation_cycles_elapsed: 0,
        },
      ],
    });

    expect(plan.status).toBe("blocked");
    expect(plan.reasons.some((reason) => reason.includes("embargo"))).toBe(true);
  });

  it("rejects refresh plans when contamination rules would be violated", () => {
    const monitorDefinition = createPromotedReleaseMonitorDefinition({
      promotedReleaseId: "candidate-release-v1",
      baselineManifestId: "baseline-manifest-v1",
      candidateManifestId: "candidate-manifest-v1",
      driftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      verifierDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
      graderDriftThresholds: {
        task_success_drift: 0.05,
        task_family_drift: 0.05,
        verifier_false_veto_drift: 0.02,
        grader_disagreement_drift: 0.03,
        source_freshness_decay: 0.2,
        latency_cost_drift: 0.1,
        hard_fail_drift: 0.03,
      },
    });
    const trigger = buildRefreshTriggerSummary({
      monitorDefinition,
      monitorAssessment: {
        should_rollback: true,
        cooldown_active: false,
        breached_dimensions: ["hard_fail_drift"],
        shadow_recheck_due_in_hours: 24,
      },
      verifierMetrics: makeVerifierMetrics(),
      graderDisagreementRate: 0.01,
      sourceFreshnessDecay: 0.1,
    });

    const plan = planContinuousOptimizationLoop({
      createdAt: "2026-03-12T14:03:00.000Z",
      driftTrigger: trigger,
      selectedLane: "system_specialization",
      traces: [
        {
          trace_ref: makeRef("trace-contaminated"),
          governed_data_status: {
            data_zone: "dev",
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            quarantined: false,
          },
          task_family: "repo-ci-verification",
          failure_labels: ["hard_fail"],
          contamination_detected: true,
        },
      ],
    });

    expect(plan.status).toBe("blocked");
    expect(plan.reasons.some((reason) => reason.includes("contaminated"))).toBe(true);
    expect(plan.selected_trace_ids).toEqual([]);
  });
});
