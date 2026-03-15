import { describe, expect, it } from "vitest";
import { nicheNextCommand } from "../../../src/commands/niche/next.js";
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

describe("nicheNextCommand", () => {
  it("returns next action for a freshly created program", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("fresh-next"));
      const result = await nicheNextCommand(
        { nicheProgramId: "fresh-next", json: true },
        silentRuntime,
      );
      expect(result.niche_program_id).toBe("fresh-next");
      expect(result.current_stage).toBe("created");
      expect(result.next_action).toContain("Compile");
      expect(result.next_command).toContain("openclaw niche compile");
    });
  });

  it("throws when program doesn't exist", async () => {
    await withTempHome(async () => {
      await expect(
        nicheNextCommand({ nicheProgramId: "does-not-exist", json: true }, silentRuntime),
      ).rejects.toThrow(/Niche program "does-not-exist" not found/u);
    });
  });
});
