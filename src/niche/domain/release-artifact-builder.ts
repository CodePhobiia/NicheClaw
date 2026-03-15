import type {
  PromotedMonitorCadenceDefaults,
  PromotedMonitorDefinition,
} from "../release/promoted-monitor.js";
import type {
  BaselineManifest,
  CandidateManifest,
  NicheCompilationRecord,
  ArtifactRef,
} from "../schema/index.js";
import type { VerifierMetricSummary } from "../verifier/index.js";

/**
 * Builds starter release artifacts from a compilation record and manifests.
 * These are sensible defaults that let operators run `niche release` without
 * manually authoring verifier metrics, monitor definitions, or artifact refs.
 */

export type StarterReleaseArtifacts = {
  verifierMetrics: VerifierMetricSummary;
  monitorDefinition: PromotedMonitorDefinition;
  componentArtifactRefs: ArtifactRef[];
};

const DEFAULT_DRIFT_THRESHOLDS = {
  task_success_drift: 0.1,
  task_family_drift: 0.15,
  verifier_false_veto_drift: 0.05,
  grader_disagreement_drift: 0.1,
  source_freshness_decay: 0.2,
  latency_cost_drift: 0.25,
  hard_fail_drift: 0.05,
};

const DEFAULT_MONITOR_POLICY = {
  policy_id: "default-policy",
  summary: "Default monitoring policy.",
};

const DEFAULT_CADENCE: PromotedMonitorCadenceDefaults = {
  shadow_recheck_interval_hours: 24,
  evaluation_window_size: 50,
  alert_hysteresis_windows: 3,
  rollback_cooldown_hours: 48,
};

export function buildStarterReleaseArtifacts(params: {
  compilationRecord: NicheCompilationRecord;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
}): StarterReleaseArtifacts {
  const nicheProgramId = params.compilationRecord.niche_program_id;

  // Starter verifier metrics: all zeros (no verifier decisions yet).
  const verifierMetrics: VerifierMetricSummary = {
    sample_count: 0,
    true_positive_rate: 0,
    false_positive_rate: 0,
    false_veto_rate: 0,
    pass_through_rate: 1,
    override_rate: 0,
    mean_latency_added_ms: 0,
    mean_cost_added: 0,
    total_cost_added: 0,
    counts: {
      true_positive: 0,
      false_positive: 0,
      false_veto: 0,
      pass_through: 0,
      overrides: 0,
    },
  };

  // Starter promoted monitor definition with sensible defaults.
  const monitorDefinition: PromotedMonitorDefinition = {
    monitor: {
      promoted_release_id: `${nicheProgramId}-release`,
      baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
      candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
      required_case_kinds: ["atomic_case"],
      shadow_recheck_policy: { ...DEFAULT_MONITOR_POLICY },
      drift_thresholds: { ...DEFAULT_DRIFT_THRESHOLDS },
      verifier_drift_thresholds: { ...DEFAULT_DRIFT_THRESHOLDS },
      grader_drift_thresholds: { ...DEFAULT_DRIFT_THRESHOLDS },
      freshness_decay_policy: { ...DEFAULT_MONITOR_POLICY },
      rollback_policy: { ...DEFAULT_MONITOR_POLICY },
    },
    cadence_defaults: { ...DEFAULT_CADENCE },
  };

  // Component artifact refs from the compilation record.
  const componentArtifactRefs: ArtifactRef[] = [
    params.compilationRecord.compiled_domain_pack_artifact_ref,
    ...params.compilationRecord.source_artifact_refs,
  ];

  return { verifierMetrics, monitorDefinition, componentArtifactRefs };
}
