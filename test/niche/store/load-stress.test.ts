import { describe, expect, it } from "vitest";
import type { NicheProgram } from "../../../src/niche/schema/index.js";
import {
  writeNicheProgram,
  getNicheProgram,
  listNichePrograms,
} from "../../../src/niche/store/program-store.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeProgram(index: number): NicheProgram {
  // Pad index to produce lexically sortable IDs
  const id = `load-test-program-${String(index).padStart(4, "0")}`;
  return {
    niche_program_id: id,
    name: `Load Test Program ${index}`,
    objective: `Validates store performance under load (case ${index}).`,
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

describe("program store load/stress tests", () => {
  it("writes 100 programs in sequence and reads each back correctly", async () => {
    await withTempHome(async () => {
      const programs: NicheProgram[] = [];
      for (let i = 0; i < 100; i++) {
        programs.push(makeProgram(i));
      }

      // Write all programs
      for (const program of programs) {
        writeNicheProgram(program, process.env);
      }

      // Read each back and verify
      for (const program of programs) {
        const stored = getNicheProgram(program.niche_program_id, process.env);
        expect(stored).not.toBeNull();
        expect(stored!.niche_program_id).toBe(program.niche_program_id);
        expect(stored!.name).toBe(program.name);
        expect(stored!.objective).toBe(program.objective);
      }
    });
  }, 30_000);

  it("lists programs after writing 100 and returns sorted results", async () => {
    await withTempHome(async () => {
      const programs: NicheProgram[] = [];
      for (let i = 0; i < 100; i++) {
        programs.push(makeProgram(i));
      }

      for (const program of programs) {
        writeNicheProgram(program, process.env);
      }

      const listed = listNichePrograms(process.env);
      expect(listed).toHaveLength(100);

      // Verify sorted order
      const ids = listed.map((p) => p.niche_program_id);
      const sortedIds = [...ids].toSorted((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sortedIds);

      // Verify first and last
      expect(ids[0]).toBe("load-test-program-0000");
      expect(ids[99]).toBe("load-test-program-0099");
    });
  }, 30_000);
});
