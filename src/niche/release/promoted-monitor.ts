import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  type BenchmarkCaseKind,
  DriftThresholdSetSchema,
  PromotedReleaseMonitorSchema,
  type DriftThresholdSet,
  type PromotedReleaseMonitor,
} from "../schema/index.js";

export const PromotedMonitorCadenceDefaultsSchema = Type.Object(
  {
    shadow_recheck_interval_hours: Type.Number({ minimum: 0 }),
    evaluation_window_size: Type.Number({ minimum: 1 }),
    alert_hysteresis_windows: Type.Number({ minimum: 1 }),
    rollback_cooldown_hours: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const PromotedMonitorDefinitionSchema = Type.Object(
  {
    monitor: PromotedReleaseMonitorSchema,
    cadence_defaults: PromotedMonitorCadenceDefaultsSchema,
  },
  { additionalProperties: false },
);

export const PromotedMonitorObservationSchema = Type.Object(
  {
    observed_drift: DriftThresholdSetSchema,
    consecutive_breach_windows: Type.Number({ minimum: 0 }),
    hours_since_last_rollback: Type.Optional(Type.Number({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export type PromotedMonitorCadenceDefaults = Static<typeof PromotedMonitorCadenceDefaultsSchema>;
export type PromotedMonitorDefinition = Static<typeof PromotedMonitorDefinitionSchema>;
export type PromotedMonitorObservation = Static<typeof PromotedMonitorObservationSchema>;

export type PromotedMonitorAssessment = {
  should_rollback: boolean;
  cooldown_active: boolean;
  breached_dimensions: Array<keyof DriftThresholdSet>;
  shadow_recheck_due_in_hours: number;
};

export const DEFAULT_PROMOTED_MONITOR_CADENCE: PromotedMonitorCadenceDefaults = {
  shadow_recheck_interval_hours: 24,
  evaluation_window_size: 7,
  alert_hysteresis_windows: 2,
  rollback_cooldown_hours: 24,
};

function collectBreachedDimensions(params: {
  thresholds: DriftThresholdSet;
  observedDrift: DriftThresholdSet;
}): Array<keyof DriftThresholdSet> {
  return (Object.entries(params.thresholds) as Array<[keyof DriftThresholdSet, number]>)
    .filter(([key, threshold]) => params.observedDrift[key] > threshold)
    .map(([key]) => key);
}

function assertPromotedMonitor(monitor: PromotedReleaseMonitor): PromotedReleaseMonitor {
  const validation = validateJsonSchemaValue({
    schema: PromotedReleaseMonitorSchema,
    cacheKey: "promoted-release-monitor",
    value: monitor,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid promoted release monitor: ${details}`);
  }
  return monitor;
}

export function createPromotedReleaseMonitorDefinition(params: {
  promotedReleaseId: string;
  baselineManifestId: string;
  candidateManifestId: string;
  driftThresholds: DriftThresholdSet;
  verifierDriftThresholds: DriftThresholdSet;
  graderDriftThresholds: DriftThresholdSet;
  requiredCaseKinds?: BenchmarkCaseKind[];
  cadenceDefaults?: Partial<PromotedMonitorCadenceDefaults>;
}): PromotedMonitorDefinition {
  const cadenceDefaults = {
    ...DEFAULT_PROMOTED_MONITOR_CADENCE,
    ...params.cadenceDefaults,
  };

  return {
    monitor: assertPromotedMonitor({
      promoted_release_id: params.promotedReleaseId,
      baseline_manifest_id: params.baselineManifestId,
      candidate_manifest_id: params.candidateManifestId,
      required_case_kinds: params.requiredCaseKinds ?? ["atomic_case"],
      shadow_recheck_policy: {
        policy_id: `${params.promotedReleaseId}-shadow-recheck`,
        summary: `Re-run shadow checks every ${cadenceDefaults.shadow_recheck_interval_hours} hours across a ${cadenceDefaults.evaluation_window_size}-window evaluation horizon.`,
      },
      drift_thresholds: params.driftThresholds,
      verifier_drift_thresholds: params.verifierDriftThresholds,
      grader_drift_thresholds: params.graderDriftThresholds,
      freshness_decay_policy: {
        policy_id: `${params.promotedReleaseId}-freshness-decay`,
        summary: `Track freshness decay across ${cadenceDefaults.evaluation_window_size} evaluation windows before triggering sustained-drift handling.`,
      },
      rollback_policy: {
        policy_id: `${params.promotedReleaseId}-rollback`,
        summary: `Rollback after ${cadenceDefaults.alert_hysteresis_windows} consecutive breached windows, with a ${cadenceDefaults.rollback_cooldown_hours}-hour cooldown.`,
      },
    }),
    cadence_defaults: cadenceDefaults,
  };
}

export function assessPromotedReleaseMonitor(params: {
  definition: PromotedMonitorDefinition;
  observation: PromotedMonitorObservation;
}): PromotedMonitorAssessment {
  const breachedDimensions = [
    ...new Set([
      ...collectBreachedDimensions({
        thresholds: params.definition.monitor.drift_thresholds,
        observedDrift: params.observation.observed_drift,
      }),
      ...collectBreachedDimensions({
        thresholds: params.definition.monitor.verifier_drift_thresholds,
        observedDrift: params.observation.observed_drift,
      }),
      ...collectBreachedDimensions({
        thresholds: params.definition.monitor.grader_drift_thresholds,
        observedDrift: params.observation.observed_drift,
      }),
    ]),
  ].toSorted((left, right) => left.localeCompare(right));
  const cooldownActive =
    params.observation.hours_since_last_rollback !== undefined &&
    params.observation.hours_since_last_rollback <
      params.definition.cadence_defaults.rollback_cooldown_hours;
  const shouldRollback =
    !cooldownActive &&
    (breachedDimensions.includes("hard_fail_drift") ||
      params.observation.consecutive_breach_windows >=
        params.definition.cadence_defaults.alert_hysteresis_windows);

  return {
    should_rollback: shouldRollback,
    cooldown_active: cooldownActive,
    breached_dimensions: breachedDimensions,
    shadow_recheck_due_in_hours: params.definition.cadence_defaults.shadow_recheck_interval_hours,
  };
}
