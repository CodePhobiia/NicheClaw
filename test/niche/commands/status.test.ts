import { describe, expect, it } from "vitest";
import { nicheStatusCommand } from "../../../src/commands/niche/status.js";
import { writeNicheProgram } from "../../../src/niche/store/program-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeProgram(id: string) {
  return {
    niche_program_id: id,
    name: `Program ${id}`,
    objective: "Test objective.",
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

describe("nicheStatusCommand", () => {
  it("returns empty when no programs exist", async () => {
    await withTempHome(async () => {
      const result = await nicheStatusCommand({ json: true });
      expect(result.programs).toEqual([]);
      expect(result.total_programs).toBe(0);
      expect(result.active_stacks).toBe(0);
      expect(result.ready_programs).toBe(0);
    });
  });

  it("returns program entries when programs exist", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("alpha-program"));
      writeNicheProgram(makeProgram("beta-program"));

      const result = await nicheStatusCommand({ json: true });
      expect(result.total_programs).toBe(2);
      expect(result.programs).toHaveLength(2);

      const ids = result.programs.map((p) => p.niche_program_id).toSorted();
      expect(ids).toEqual(["alpha-program", "beta-program"]);

      for (const entry of result.programs) {
        expect(entry.name).toBeTruthy();
        expect(entry.latest_version).toBeNull();
        expect(entry.readiness_status).toBeNull();
        expect(entry.active_stack_id).toBeNull();
      }
    });
  });

  it("filters by niche-program-id", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("alpha-program"));
      writeNicheProgram(makeProgram("beta-program"));

      const result = await nicheStatusCommand({
        nicheProgramId: "alpha-program",
        json: true,
      });
      expect(result.total_programs).toBe(1);
      expect(result.programs).toHaveLength(1);
      expect(result.programs[0]!.niche_program_id).toBe("alpha-program");
    });
  });
});
