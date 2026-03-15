import { describe, expect, it } from "vitest";
import { nicheListCommand } from "../../../src/commands/niche/list.js";
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

const silentRuntime = {
  log: () => {},
  error: () => {},
  exit: () => {
    throw new Error("exit called");
  },
};

describe("nicheListCommand", () => {
  it("returns empty list when no programs exist", async () => {
    await withTempHome(async () => {
      const result = await nicheListCommand({ json: true }, silentRuntime);
      expect(result.programs).toEqual([]);
    });
  });

  it("returns programs with stage info", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("alpha"));
      writeNicheProgram(makeProgram("beta"));

      const result = await nicheListCommand({ json: true }, silentRuntime);
      expect(result.programs).toHaveLength(2);

      const ids = result.programs.map((p) => p.niche_program_id).toSorted();
      expect(ids).toEqual(["alpha", "beta"]);

      for (const entry of result.programs) {
        expect(entry.name).toBeTruthy();
        expect(entry.stage).toBe("created");
        expect(entry.readiness).toBeNull();
        expect(entry.benchmarks).toBe(0);
      }
    });
  });
});
