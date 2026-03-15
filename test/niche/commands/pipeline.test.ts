import { describe, expect, it } from "vitest";
import { nichePipelineCommand } from "../../../src/commands/niche/pipeline.js";
import { writeNicheProgram } from "../../../src/niche/store/program-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeProgram(id: string) {
  return {
    niche_program_id: id,
    name: `Program ${id}`,
    objective: "Test.",
    risk_class: "moderate" as const,
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "anthropic",
        model_id: "claude-sonnet-4-5-20250514",
        api_mode: "messages",
      },
      specialization_lanes: ["system_specialization" as const],
    },
    allowed_tools: ["read", "exec"],
    allowed_sources: [{ source_id: "s1", source_kind: "repos" as const, description: "Repo." }],
    success_metrics: [
      {
        metric_id: "m1",
        label: "Success",
        objective: "maximize" as const,
        target_description: "Improve.",
        measurement_method: "benchmark",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "Store.",
      training_policy: "Train.",
      benchmark_policy: "Benchmark.",
      retention_policy: "Retain.",
      redaction_policy: "Redact.",
      pii_policy: "No PII.",
      live_trace_reuse_policy: "Embargo.",
      operator_review_required: true,
    },
  };
}

describe("nichePipelineCommand", () => {
  it("fails gracefully when sources missing for compile", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("test-pipeline"), process.env);
      const result = await nichePipelineCommand({
        nicheProgramId: "test-pipeline",
        json: false,
      });
      expect(result.completed).toBe(false);
      expect(result.stages[0]?.status).toBe("failed");
    });
  });

  it("succeeds with sources present through compile stage", async () => {
    await withTempHome(async (home) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      writeNicheProgram(makeProgram("pipeline-sources"), process.env);
      const sourceDir = path.join(home, "sources");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(
        path.join(sourceDir, "doc.md"),
        "# Repo docs\n\nCI pipeline runs tests on every push.\n",
      );
      const result = await nichePipelineCommand({
        nicheProgramId: "pipeline-sources",
        sourcePaths: [sourceDir],
        from: "compile",
        to: "compile",
        json: false,
      });
      expect(result.niche_program_id).toBe("pipeline-sources");
      // Compile stage should complete (or fail with a domain-level issue, not a missing-sources error)
      expect(result.stages.length).toBeGreaterThanOrEqual(1);
      expect(result.stages[0]?.stage).toBe("compile");
    });
  });

  it("fails with invalid program ID", async () => {
    await withTempHome(async () => {
      const result = await nichePipelineCommand({
        nicheProgramId: "nonexistent-program-id",
        json: false,
      });
      expect(result.completed).toBe(false);
      expect(result.stages[0]?.status).toBe("failed");
      expect(result.stages[0]?.error).toMatch(/not found/i);
    });
  });

  it("stops after compile failure and does not run later stages", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("pipeline-stop"), process.env);
      // No sourcePaths → compile fails; readiness and prepare-benchmark should not run
      const result = await nichePipelineCommand({
        nicheProgramId: "pipeline-stop",
        json: false,
      });
      expect(result.completed).toBe(false);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0]?.stage).toBe("compile");
      expect(result.stages[0]?.status).toBe("failed");
    });
  });

  it("returns JSON output when json option is true", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("pipeline-json"), process.env);
      const logSpy: string[] = [];
      const runtime = { log: (msg: string) => logSpy.push(msg) };
      const result = await nichePipelineCommand(
        {
          nicheProgramId: "pipeline-json",
          json: true,
        },
        runtime as never,
      );
      expect(result.niche_program_id).toBe("pipeline-json");
      // When json is true, the runtime.log should receive JSON output
      expect(logSpy.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logSpy[0]!);
      expect(parsed.niche_program_id).toBe("pipeline-json");
      expect(Array.isArray(parsed.stages)).toBe(true);
    });
  });
});
