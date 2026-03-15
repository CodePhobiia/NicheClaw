import { describe, expect, it } from "vitest";
import { nicheReadinessCommand } from "../../../src/commands/niche/readiness.js";
import { nicheStatusCommand } from "../../../src/commands/niche/status.js";
import type { NicheProgram, ReadinessReport, RuntimeEnv } from "../../../src/niche/schema/index.js";
import { writeNicheProgram } from "../../../src/niche/store/program-store.js";
import { saveReadinessReport } from "../../../src/niche/store/readiness-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function createMockRuntime() {
  const logs: string[] = [];
  return {
    runtime: {
      log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
      error: (...args: unknown[]) => logs.push(`ERROR: ${args.map(String).join(" ")}`),
      exit: (code: number) => {
        throw new Error(`exit:${code}`);
      },
    } satisfies RuntimeEnv,
    logs,
  };
}

function makeProgram(id: string): NicheProgram {
  return {
    niche_program_id: id,
    name: "CLI Snapshot Program",
    objective: "Used for CLI output snapshot tests.",
    risk_class: "low",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "openai",
        model_id: "gpt-5",
        api_mode: "responses",
      },
      specialization_lanes: ["prompt_policy_assets"],
    },
    allowed_tools: ["exec"],
    allowed_sources: [
      {
        source_id: "repo-doc",
        source_kind: "repos",
      },
    ],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success rate",
        objective: "maximize",
        target_description: "Above 90%.",
        measurement_method: "Benchmark evaluation.",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "local",
      training_policy: "approved_only",
      benchmark_policy: "approved_only",
      retention_policy: "retain_for_90_days",
      redaction_policy: "none",
      pii_policy: "none",
      live_trace_reuse_policy: "benchmark_only",
      operator_review_required: false,
    },
  };
}

function makeReadyReport(nicheProgramId: string): ReadinessReport {
  return {
    readiness_report_id: `${nicheProgramId}-readiness`,
    niche_program_id: nicheProgramId,
    status: "ready",
    dimension_scores: {
      source_quality: { score: 85 },
      source_coverage: { score: 80 },
      contradiction_rate: { score: 5 },
      freshness: { score: 90 },
      rights_sufficiency: { score: 95 },
      task_observability: { score: 75 },
      benchmarkability: { score: 70 },
      measurable_success_criteria: { score: 80 },
      tool_availability: { score: 90 },
    },
    hard_blockers: [],
    warnings: [],
    recommended_next_actions: [
      {
        action_id: "proceed-with-specialization",
        summary: "The niche is ready for the next specialization stage.",
        priority: "optional",
      },
    ],
    generated_at: "2026-03-14T10:00:00.000Z",
  };
}

describe("CLI output snapshot tests", () => {
  it("nicheReadinessCommand with json: false produces expected text format", async () => {
    await withTempHome(async () => {
      const programId = "cli-snapshot-readiness";
      const program = makeProgram(programId);
      writeNicheProgram(program, process.env);

      const report = makeReadyReport(programId);
      saveReadinessReport(report, process.env);

      const { runtime, logs } = createMockRuntime();
      const result = await nicheReadinessCommand(
        { nicheProgramId: programId, json: false },
        runtime,
      );

      expect(result.readiness_report.status).toBe("ready");
      expect(logs).toHaveLength(1);

      const output = logs[0]!;
      expect(output).toContain(`Readiness for ${programId}: ready`);
      expect(output).toContain(`Report: ${programId}-readiness`);
    });
  });

  it("nicheReadinessCommand with json: true produces valid JSON", async () => {
    await withTempHome(async () => {
      const programId = "cli-snapshot-json";
      const program = makeProgram(programId);
      writeNicheProgram(program, process.env);

      const report = makeReadyReport(programId);
      saveReadinessReport(report, process.env);

      const { runtime, logs } = createMockRuntime();
      await nicheReadinessCommand({ nicheProgramId: programId, json: true }, runtime);

      expect(logs).toHaveLength(1);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed).toHaveProperty("readiness_report");
      expect(parsed.readiness_report.niche_program_id).toBe(programId);
      expect(parsed.readiness_report.status).toBe("ready");
    });
  });

  it("nicheStatusCommand with json: true produces expected JSON structure", async () => {
    await withTempHome(async () => {
      const programId = "cli-snapshot-status";
      const program = makeProgram(programId);
      writeNicheProgram(program, process.env);

      const result = await nicheStatusCommand({
        nicheProgramId: programId,
        json: true,
      });

      expect(result).toHaveProperty("programs");
      expect(result).toHaveProperty("total_programs");
      expect(result).toHaveProperty("active_stacks");
      expect(result).toHaveProperty("ready_programs");
      expect(result.total_programs).toBe(1);
      expect(result.programs[0]!.niche_program_id).toBe(programId);
      expect(result.programs[0]!.name).toBe("CLI Snapshot Program");
    });
  });
});
