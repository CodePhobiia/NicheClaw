import { describe, expect, it } from "vitest";
import {
  generateReadinessGuidance,
  formatReadinessGuidance,
} from "../../../src/niche/domain/index.js";
import type { ReadinessReport } from "../../../src/niche/schema/index.js";

function makeReport(overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  return {
    readiness_report_id: "test-readiness",
    niche_program_id: "test-program",
    status: "not_ready",
    dimension_scores: {
      source_quality: { score: 80, rationale: "ok" },
      source_coverage: { score: 20, rationale: "low" },
      contradiction_rate: { score: 10, rationale: "ok" },
      freshness: { score: 70, rationale: "ok" },
      rights_sufficiency: { score: 100, rationale: "ok" },
      task_observability: { score: 60, rationale: "ok" },
      benchmarkability: { score: 25, rationale: "low" },
      measurable_success_criteria: { score: 70, rationale: "ok" },
      tool_availability: { score: 65, rationale: "low" },
    },
    hard_blockers: [
      {
        blocker_code: "source_coverage_too_low_for_benchmarkable_domain_pack",
        message: "Source coverage is too low.",
      },
      {
        blocker_code: "benchmarkability_below_minimum_threshold",
        message: "Benchmarkability is below the minimum.",
      },
      {
        blocker_code: "tool_availability_inadequate_for_workflow",
        message: "Tool availability inadequate.",
      },
    ],
    warnings: [],
    recommended_next_actions: [],
    generated_at: "2026-03-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("readiness guidance", () => {
  it("generates guidance for each hard blocker with scores and remediation", () => {
    const report = makeReport();
    const guidance = generateReadinessGuidance(report);

    expect(guidance).toHaveLength(3);
    expect(guidance[0]!.code).toBe("source_coverage_too_low_for_benchmarkable_domain_pack");
    expect(guidance[0]!.severity).toBe("blocker");
    expect(guidance[0]!.current_score).toBe(20);
    expect(guidance[0]!.threshold).toBe(30);
    expect(guidance[0]!.remediation).toContain("source kinds");

    expect(guidance[1]!.code).toBe("benchmarkability_below_minimum_threshold");
    expect(guidance[1]!.current_score).toBe(25);
    expect(guidance[1]!.threshold).toBe(50);
    expect(guidance[1]!.remediation).toContain("benchmark_seed");

    expect(guidance[2]!.code).toBe("tool_availability_inadequate_for_workflow");
    expect(guidance[2]!.current_score).toBe(65);
    expect(guidance[2]!.threshold).toBe(80);
    expect(guidance[2]!.remediation).toContain("allowed_tools");
  });

  it("generates guidance for warnings", () => {
    const report = makeReport({
      status: "ready_with_warnings",
      hard_blockers: [],
      warnings: [
        { warning_code: "low_source_quality", message: "Source quality low." },
        { warning_code: "weak_success_criteria", message: "Weak criteria." },
      ],
    });
    const guidance = generateReadinessGuidance(report);

    expect(guidance).toHaveLength(2);
    expect(guidance[0]!.severity).toBe("warning");
    expect(guidance[0]!.code).toBe("low_source_quality");
    expect(guidance[1]!.code).toBe("weak_success_criteria");
  });

  it("returns empty guidance for ready reports", () => {
    const report = makeReport({
      status: "ready",
      hard_blockers: [],
      warnings: [],
    });
    const guidance = generateReadinessGuidance(report);
    expect(guidance).toHaveLength(0);
  });

  it("formats guidance as readable text", () => {
    const report = makeReport();
    const guidance = generateReadinessGuidance(report);
    const formatted = formatReadinessGuidance(guidance);

    expect(formatted).toContain("[BLOCKER]");
    expect(formatted).toContain("Too few source kinds");
    expect(formatted).toContain("score: 20");
    expect(formatted).toContain("need: >= 30");
    expect(formatted).toContain("Fix:");
  });

  it("every blocker code maps to a non-empty remediation", () => {
    const allBlockerCodes = [
      "insufficient_rights_to_use",
      "benchmarkability_below_minimum_threshold",
      "contradiction_rate_exceeds_hard_threshold",
      "tool_availability_inadequate_for_workflow",
      "source_coverage_too_low_for_benchmarkable_domain_pack",
    ];
    for (const code of allBlockerCodes) {
      const report = makeReport({
        hard_blockers: [{ blocker_code: code, message: `${code} triggered.` }],
      });
      const guidance = generateReadinessGuidance(report);
      expect(guidance.length).toBeGreaterThanOrEqual(1);
      const item = guidance.find((g) => g.code === code);
      expect(item, `Missing guidance for ${code}`).toBeDefined();
      expect(item!.remediation.length).toBeGreaterThan(0);
    }
  });
});
