import { describe, expect, it } from "vitest";
import { executeBatch, listMatchingProgramIds } from "../../../src/niche/batch/batch-executor.js";
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

describe("executeBatch", () => {
  it("runs executor for each program ID", async () => {
    const executed: string[] = [];
    const result = await executeBatch({
      programIds: ["prog-a", "prog-b", "prog-c"],
      executor: async (id) => {
        executed.push(id);
        return `done-${id}`;
      },
    });

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(executed).toEqual(["prog-a", "prog-b", "prog-c"]);

    // Results are sorted by niche_program_id
    expect(result.results[0]!.niche_program_id).toBe("prog-a");
    expect(result.results[0]!.success).toBe(true);
    expect(result.results[0]!.result).toBe("done-prog-a");
    expect(result.results[0]!.error).toBeNull();
  });

  it("collects errors without stopping batch", async () => {
    const result = await executeBatch({
      programIds: ["ok-1", "fail-1", "ok-2"],
      executor: async (id) => {
        if (id === "fail-1") {
          throw new Error("simulated failure");
        }
        return `success-${id}`;
      },
    });

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);

    const failedEntry = result.results.find((r) => r.niche_program_id === "fail-1");
    expect(failedEntry).toBeDefined();
    expect(failedEntry!.success).toBe(false);
    expect(failedEntry!.result).toBeNull();
    expect(failedEntry!.error).toContain("simulated failure");

    const okEntry = result.results.find((r) => r.niche_program_id === "ok-2");
    expect(okEntry).toBeDefined();
    expect(okEntry!.success).toBe(true);
  });
});

describe("listMatchingProgramIds", () => {
  it("with glob filter", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("repo-ci-alpha"));
      writeNicheProgram(makeProgram("repo-ci-beta"));
      writeNicheProgram(makeProgram("other-program"));

      const matched = listMatchingProgramIds({
        programFilter: "repo-ci-*",
        env: process.env,
      });
      expect(matched.toSorted()).toEqual(["repo-ci-alpha", "repo-ci-beta"]);
    });
  });

  it("with no filter returns all", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("prog-x"));
      writeNicheProgram(makeProgram("prog-y"));

      const matched = listMatchingProgramIds({ env: process.env });
      expect(matched.toSorted()).toEqual(["prog-x", "prog-y"]);
    });
  });
});
