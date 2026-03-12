import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  PromotedReleaseMonitorSchema,
  type DriftThresholdSet,
  type PromotedReleaseMonitor,
} from "../schema/index.js";

export type PromotedMonitorCadenceDefaults = {
  shadow_recheck_interval_hours: number;
  evaluation_window_size: number;
  alert_hysteresis_windows: number;
  rollback_cooldown_hours: number;
};

export type PromotedMonitorDefinition = {
  monitor: PromotedReleaseMonitor;
  cadence_defaults: PromotedMonitorCadenceDefaults;
};

export type PromotedMonitorObservation = {
  observed_drift: DriftThresholdSet;
  consecutive_breach_windows: number;
  hours_since_last_rollback?: number;
};

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
  const thresholdEntries = Object.entries(
    params.definition.monitor.drift_thresholds,
  ) as Array<[keyof DriftThresholdSet, number]>;
  const breachedDimensions = thresholdEntries
    .filter(([key, threshold]) => params.observation.observed_drift[key] > threshold)
    .map(([key]) => key);
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
    shadow_recheck_due_in_hours:
      params.definition.cadence_defaults.shadow_recheck_interval_hours,
  };
}
