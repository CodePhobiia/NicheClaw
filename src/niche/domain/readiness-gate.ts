import type {
  ArtifactRightsState,
  ReadinessAction,
  ReadinessDimensionScores,
  ReadinessHardBlocker,
  ReadinessReport,
  ReadinessWarning,
} from "../schema/index.js";
import { isReadyForSpecialization } from "../schema/index.js";
import { DEFAULT_READINESS_THRESHOLDS, type ReadinessThresholds } from "./readiness-thresholds.js";

export type ReadinessGateInput = {
  nicheProgramId: string;
  generatedAt: string;
  thresholds?: ReadinessThresholds;
  dimensionValues: {
    source_quality: number;
    source_coverage: number;
    contradiction_rate: number;
    freshness: number;
    rights_sufficiency: number;
    task_observability: number;
    benchmarkability: number;
    measurable_success_criteria: number;
    tool_availability: number;
  };
  rightsState?: ArtifactRightsState;
};

function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
}

function buildDimensionScores(
  values: ReadinessGateInput["dimensionValues"],
): ReadinessDimensionScores {
  return {
    source_quality: {
      score: clampScore(values.source_quality),
      rationale: "Score derived from source accuracy and consistency inputs.",
    },
    source_coverage: {
      score: clampScore(values.source_coverage),
      rationale: "Score derived from workflow and corpus coverage inputs.",
    },
    contradiction_rate: {
      score: clampScore(values.contradiction_rate),
      rationale: "Higher score means more contradiction pressure in the current source set.",
    },
    freshness: {
      score: clampScore(values.freshness),
      rationale: "Score derived from how current the approved sources are.",
    },
    rights_sufficiency: {
      score: clampScore(values.rights_sufficiency),
      rationale: "Score derived from declared storage, training, and benchmark rights.",
    },
    task_observability: {
      score: clampScore(values.task_observability),
      rationale: "Score derived from the observability of task steps and outcomes.",
    },
    benchmarkability: {
      score: clampScore(values.benchmarkability),
      rationale: "Score derived from whether the niche supports held-out evaluation.",
    },
    measurable_success_criteria: {
      score: clampScore(values.measurable_success_criteria),
      rationale: "Score derived from the clarity of success metrics and pass conditions.",
    },
    tool_availability: {
      score: clampScore(values.tool_availability),
      rationale: "Score derived from how well the declared tool set covers the workflow.",
    },
  };
}

function buildHardBlockers(
  input: ReadinessGateInput,
  thresholds: ReadinessThresholds,
): ReadinessHardBlocker[] {
  const blockers: ReadinessHardBlocker[] = [];
  const values = input.dimensionValues;

  if (
    input.rightsState &&
    (!input.rightsState.rights_to_store || !input.rightsState.rights_to_benchmark)
  ) {
    blockers.push({
      blocker_code: "insufficient_rights_to_use",
      message: "The declared rights state does not allow storage and benchmarking.",
    });
  }

  if (values.benchmarkability < thresholds.benchmarkability_min) {
    blockers.push({
      blocker_code: "benchmarkability_below_minimum_threshold",
      message: "Benchmarkability is below the minimum threshold.",
    });
  }

  if (values.contradiction_rate > thresholds.contradiction_rate_max) {
    blockers.push({
      blocker_code: "contradiction_rate_exceeds_hard_threshold",
      message: "Contradiction rate exceeds the hard threshold.",
    });
  }

  if (values.tool_availability < thresholds.tool_availability_min) {
    blockers.push({
      blocker_code: "tool_availability_inadequate_for_workflow",
      message: "Tool availability is inadequate for the declared workflow.",
    });
  }

  if (values.source_coverage < thresholds.source_coverage_min) {
    blockers.push({
      blocker_code: "source_coverage_too_low_for_benchmarkable_domain_pack",
      message: "Source coverage is too low to support a benchmarkable domain pack.",
    });
  }

  return blockers;
}

function buildWarnings(
  input: ReadinessGateInput,
  thresholds: ReadinessThresholds,
): ReadinessWarning[] {
  const warnings: ReadinessWarning[] = [];
  const values = input.dimensionValues;

  if (values.source_quality < thresholds.source_quality_min) {
    warnings.push({
      warning_code: "low_source_quality",
      message: "Source quality is below the recommended threshold.",
    });
  }

  if (values.freshness < thresholds.freshness_min) {
    warnings.push({
      warning_code: "low_freshness",
      message: "Source freshness is below the recommended threshold.",
    });
  }

  if (values.task_observability < thresholds.task_observability_min) {
    warnings.push({
      warning_code: "low_task_observability",
      message: "Task observability is below the recommended threshold.",
    });
  }

  if (values.measurable_success_criteria < thresholds.measurable_success_criteria_min) {
    warnings.push({
      warning_code: "weak_success_criteria",
      message: "Success criteria are weaker than recommended for specialization.",
    });
  }

  if (values.rights_sufficiency < thresholds.rights_sufficiency_min) {
    warnings.push({
      warning_code: "rights_need_review",
      message: "Rights sufficiency is below the recommended threshold and should be reviewed.",
    });
  }

  return warnings;
}

function buildRecommendedActions(
  blockers: ReadinessHardBlocker[],
  warnings: ReadinessWarning[],
): ReadinessAction[] {
  const actions: ReadinessAction[] = [];

  if (blockers.some((blocker) => blocker.blocker_code === "insufficient_rights_to_use")) {
    actions.push({
      action_id: "resolve_rights_gap",
      summary: "Acquire explicit authorization for storage and benchmark reuse.",
      priority: "required",
    });
  }

  if (
    blockers.some(
      (blocker) => blocker.blocker_code === "source_coverage_too_low_for_benchmarkable_domain_pack",
    )
  ) {
    actions.push({
      action_id: "increase_source_coverage",
      summary: "Add more approved workflow sources before attempting specialization.",
      priority: "required",
    });
  }

  if (warnings.some((warning) => warning.warning_code === "low_freshness")) {
    actions.push({
      action_id: "refresh_sources",
      summary: "Refresh stale sources before benchmark generation.",
      priority: "recommended",
    });
  }

  if (warnings.some((warning) => warning.warning_code === "weak_success_criteria")) {
    actions.push({
      action_id: "clarify_success_metrics",
      summary: "Define clearer pass/fail criteria for the target workflow.",
      priority: "recommended",
    });
  }

  if (actions.length === 0) {
    actions.push({
      action_id: "proceed_with_specialization",
      summary: "The niche is ready for the next specialization stage.",
      priority: "optional",
    });
  }

  return actions;
}

export function evaluateReadinessGate(input: ReadinessGateInput): ReadinessReport {
  const thresholds = input.thresholds ?? DEFAULT_READINESS_THRESHOLDS;
  const dimensionScores = buildDimensionScores(input.dimensionValues);
  const hardBlockers = buildHardBlockers(input, thresholds);
  const warnings = buildWarnings(input, thresholds);
  const recommendedNextActions = buildRecommendedActions(hardBlockers, warnings);

  const status =
    hardBlockers.length > 0 ? "not_ready" : warnings.length > 0 ? "ready_with_warnings" : "ready";

  return {
    readiness_report_id: `${input.nicheProgramId}-readiness`,
    niche_program_id: input.nicheProgramId,
    status,
    dimension_scores: dimensionScores,
    hard_blockers: hardBlockers,
    warnings,
    recommended_next_actions: recommendedNextActions,
    generated_at: input.generatedAt,
  };
}

export function buildReadinessRefusal(report: ReadinessReport): {
  ready: boolean;
  report: ReadinessReport;
  reason?: string;
} {
  if (isReadyForSpecialization(report)) {
    return {
      ready: true,
      report,
    };
  }

  return {
    ready: false,
    report,
    reason: report.hard_blockers[0]?.message ?? "The niche is not ready for specialization.",
  };
}
