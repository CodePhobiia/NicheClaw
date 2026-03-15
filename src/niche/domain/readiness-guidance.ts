import type { ReadinessReport } from "../schema/index.js";

type BlockerGuidance = {
  blocker_code: string;
  title: string;
  remediation: string;
};

const BLOCKER_GUIDANCE: BlockerGuidance[] = [
  {
    blocker_code: "insufficient_rights_to_use",
    title: "Insufficient rights",
    remediation:
      "Set rights_to_store: true and rights_to_benchmark: true on all source descriptors, then recompile.",
  },
  {
    blocker_code: "benchmarkability_below_minimum_threshold",
    title: "Too few benchmark seeds",
    remediation:
      "Add at least 2 benchmark_seed source descriptors (each adds 25 points; need score >= 50), then recompile.",
  },
  {
    blocker_code: "contradiction_rate_exceeds_hard_threshold",
    title: "High contradiction rate",
    remediation:
      "Review sources for overlapping content with conflicting metadata. Remove or quarantine contradictory sources, then recompile.",
  },
  {
    blocker_code: "tool_availability_inadequate_for_workflow",
    title: "Not enough tools",
    remediation:
      "Add more tools to allowed_tools in the NicheProgram (each adds 15 points to a base of 50; need score >= 80, so at least 2 tools), then recompile.",
  },
  {
    blocker_code: "source_coverage_too_low_for_benchmarkable_domain_pack",
    title: "Too few source kinds",
    remediation:
      "Add sources from more source kinds (score = distinct_kinds / 10 * 100; need at least 3 kinds for score >= 30). Available kinds: documents, websites, repos, logs, datasets, tool_schemas, past_task_traces, human_examples, domain_constraints, live_sources.",
  },
];

type WarningGuidance = {
  warning_code: string;
  title: string;
  remediation: string;
};

const WARNING_GUIDANCE: WarningGuidance[] = [
  {
    warning_code: "low_source_quality",
    title: "Low source quality",
    remediation:
      "Improve source provenance_status to 'verified' and redaction_status to 'clean' across more sources.",
  },
  {
    warning_code: "low_freshness",
    title: "Low freshness",
    remediation:
      "Add freshnessExpectation fields to source descriptors and ensure sources are current.",
  },
  {
    warning_code: "low_task_observability",
    title: "Low task observability",
    remediation:
      "Add more task families to the domain pack or provide sources with observable task steps.",
  },
  {
    warning_code: "weak_success_criteria",
    title: "Weak success criteria",
    remediation:
      "Add more success_metrics to the NicheProgram (each metric adds 20 points to a base of 50; need score >= 70).",
  },
  {
    warning_code: "rights_need_review",
    title: "Rights need review",
    remediation:
      "Review and set all 6 rights flags (rights_to_store, rights_to_train, rights_to_benchmark, rights_to_derive, rights_to_distill, rights_to_generate_synthetic_from) to true where appropriate.",
  },
];

export type ReadinessGuidanceItem = {
  code: string;
  title: string;
  severity: "blocker" | "warning";
  current_score?: number;
  threshold?: number;
  remediation: string;
};

/**
 * Generates human-readable guidance for a readiness report, mapping each
 * blocker and warning to actionable remediation steps.
 */
export function generateReadinessGuidance(report: ReadinessReport): ReadinessGuidanceItem[] {
  const items: ReadinessGuidanceItem[] = [];

  for (const blocker of report.hard_blockers) {
    const guidance = BLOCKER_GUIDANCE.find((g) => g.blocker_code === blocker.blocker_code);
    const score = getDimensionScoreForBlocker(report, blocker.blocker_code);
    items.push({
      code: blocker.blocker_code,
      title: guidance?.title ?? blocker.blocker_code,
      severity: "blocker",
      current_score: score?.current,
      threshold: score?.threshold,
      remediation: guidance?.remediation ?? blocker.message,
    });
  }

  for (const warning of report.warnings) {
    const guidance = WARNING_GUIDANCE.find((g) => g.warning_code === warning.warning_code);
    const score = getDimensionScoreForWarning(report, warning.warning_code);
    items.push({
      code: warning.warning_code,
      title: guidance?.title ?? warning.warning_code,
      severity: "warning",
      current_score: score?.current,
      threshold: score?.threshold,
      remediation: guidance?.remediation ?? warning.message,
    });
  }

  return items;
}

function getDimensionScoreForBlocker(
  report: ReadinessReport,
  blockerCode: string,
): { current: number; threshold: number } | undefined {
  const scores = report.dimension_scores;
  switch (blockerCode) {
    case "insufficient_rights_to_use":
      return { current: scores.rights_sufficiency.score, threshold: 80 };
    case "benchmarkability_below_minimum_threshold":
      return { current: scores.benchmarkability.score, threshold: 50 };
    case "contradiction_rate_exceeds_hard_threshold":
      return { current: scores.contradiction_rate.score, threshold: 30 };
    case "tool_availability_inadequate_for_workflow":
      return { current: scores.tool_availability.score, threshold: 80 };
    case "source_coverage_too_low_for_benchmarkable_domain_pack":
      return { current: scores.source_coverage.score, threshold: 30 };
    default:
      return undefined;
  }
}

function getDimensionScoreForWarning(
  report: ReadinessReport,
  warningCode: string,
): { current: number; threshold: number } | undefined {
  const scores = report.dimension_scores;
  switch (warningCode) {
    case "low_source_quality":
      return { current: scores.source_quality.score, threshold: 70 };
    case "low_freshness":
      return { current: scores.freshness.score, threshold: 60 };
    case "low_task_observability":
      return { current: scores.task_observability.score, threshold: 50 };
    case "weak_success_criteria":
      return { current: scores.measurable_success_criteria.score, threshold: 70 };
    case "rights_need_review":
      return { current: scores.rights_sufficiency.score, threshold: 80 };
    default:
      return undefined;
  }
}

/**
 * Formats readiness guidance as a human-readable string for CLI output.
 */
export function formatReadinessGuidance(items: ReadinessGuidanceItem[]): string {
  if (items.length === 0) {
    return "No issues found. The niche is ready for specialization.";
  }

  const lines: string[] = [];
  const blockers = items.filter((i) => i.severity === "blocker");
  const warnings = items.filter((i) => i.severity === "warning");

  if (blockers.length > 0) {
    lines.push(`Hard blockers (${blockers.length}):`);
    for (const b of blockers) {
      const scoreInfo =
        b.current_score !== undefined && b.threshold !== undefined
          ? ` (score: ${b.current_score}, need: ${b.threshold === 30 && b.code.includes("contradiction") ? `<= ${b.threshold}` : `>= ${b.threshold}`})`
          : "";
      lines.push(`  [BLOCKER] ${b.title}${scoreInfo}`);
      lines.push(`    Fix: ${b.remediation}`);
    }
  }

  if (warnings.length > 0) {
    lines.push(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      const scoreInfo =
        w.current_score !== undefined && w.threshold !== undefined
          ? ` (score: ${w.current_score}, need: >= ${w.threshold})`
          : "";
      lines.push(`  [WARNING] ${w.title}${scoreInfo}`);
      lines.push(`    Fix: ${w.remediation}`);
    }
  }

  return lines.join("\n");
}
