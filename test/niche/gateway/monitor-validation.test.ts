import { describe, expect, it } from "vitest";
import {
  PromotedMonitorDefinitionSchema,
  PromotedMonitorObservationSchema,
} from "../../../src/niche/release/promoted-monitor.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";

function makeDriftThresholds() {
  return {
    task_success_drift: 0.1,
    task_family_drift: 0.1,
    verifier_false_veto_drift: 0.05,
    grader_disagreement_drift: 0.1,
    source_freshness_decay: 0.15,
    latency_cost_drift: 0.2,
    hard_fail_drift: 0.01,
  };
}

function makeValidDefinition() {
  return {
    monitor: {
      promoted_release_id: "release-1",
      baseline_manifest_id: "baseline-1",
      candidate_manifest_id: "candidate-1",
      required_case_kinds: ["atomic_case"],
      shadow_recheck_policy: { policy_id: "shadow-1", summary: "Recheck every 24h." },
      drift_thresholds: makeDriftThresholds(),
      verifier_drift_thresholds: makeDriftThresholds(),
      grader_drift_thresholds: makeDriftThresholds(),
      freshness_decay_policy: { policy_id: "freshness-1", summary: "Track freshness." },
      rollback_policy: { policy_id: "rollback-1", summary: "Rollback on breach." },
    },
    cadence_defaults: {
      shadow_recheck_interval_hours: 24,
      evaluation_window_size: 7,
      alert_hysteresis_windows: 2,
      rollback_cooldown_hours: 24,
    },
  };
}

function makeValidObservation() {
  return {
    observed_drift: makeDriftThresholds(),
    consecutive_breach_windows: 0,
  };
}

describe("FC-08: gateway TypeBox validation for niche.monitor.assess", () => {
  it("valid definition passes validation", () => {
    const result = validateJsonSchemaValue({
      schema: PromotedMonitorDefinitionSchema as unknown as Record<string, unknown>,
      cacheKey: "monitor-definition-valid",
      value: makeValidDefinition(),
    });
    expect(result.ok).toBe(true);
  });

  it("definition missing monitor fails validation", () => {
    const definition = {
      cadence_defaults: {
        shadow_recheck_interval_hours: 24,
        evaluation_window_size: 7,
        alert_hysteresis_windows: 2,
        rollback_cooldown_hours: 24,
      },
    };
    const result = validateJsonSchemaValue({
      schema: PromotedMonitorDefinitionSchema as unknown as Record<string, unknown>,
      cacheKey: "monitor-definition-missing-monitor",
      value: definition,
    });
    expect(result.ok).toBe(false);
  });

  it("definition with invalid cadence_defaults fails validation", () => {
    const definition = makeValidDefinition();
    (definition as Record<string, unknown>).cadence_defaults = {
      shadow_recheck_interval_hours: -1, // must be >= 0
      evaluation_window_size: 0, // must be >= 1
      alert_hysteresis_windows: 0, // must be >= 1
      rollback_cooldown_hours: -5, // must be >= 0
    };
    const result = validateJsonSchemaValue({
      schema: PromotedMonitorDefinitionSchema as unknown as Record<string, unknown>,
      cacheKey: "monitor-definition-invalid-cadence",
      value: definition,
    });
    expect(result.ok).toBe(false);
  });

  it("valid observation passes validation", () => {
    const result = validateJsonSchemaValue({
      schema: PromotedMonitorObservationSchema as unknown as Record<string, unknown>,
      cacheKey: "monitor-observation-valid",
      value: makeValidObservation(),
    });
    expect(result.ok).toBe(true);
  });

  it("observation missing observed_drift fails validation", () => {
    const observation = {
      consecutive_breach_windows: 0,
    };
    const result = validateJsonSchemaValue({
      schema: PromotedMonitorObservationSchema as unknown as Record<string, unknown>,
      cacheKey: "monitor-observation-missing-drift",
      value: observation,
    });
    expect(result.ok).toBe(false);
  });
});
