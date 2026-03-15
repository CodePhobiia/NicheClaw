export type ReadinessThresholds = {
  source_quality_min: number;
  source_coverage_min: number;
  contradiction_rate_max: number;
  freshness_min: number;
  rights_sufficiency_min: number;
  task_observability_min: number;
  benchmarkability_min: number;
  measurable_success_criteria_min: number;
  tool_availability_min: number;
};

export const DEFAULT_READINESS_THRESHOLDS: ReadinessThresholds = {
  source_quality_min: 70,
  source_coverage_min: 30, // 3+ distinct source kinds out of 10 total
  contradiction_rate_max: 30,
  freshness_min: 60,
  rights_sufficiency_min: 80,
  task_observability_min: 50,
  benchmarkability_min: 50, // 2+ benchmark seeds
  measurable_success_criteria_min: 70,
  tool_availability_min: 80,
};
