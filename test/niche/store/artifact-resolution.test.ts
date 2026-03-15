import { describe, expect, it } from "vitest";
import {
  buildWorkflowErrorMessage,
  resolveCompilationArtifacts,
  resolveManifestArtifacts,
  resolveBenchmarkArtifacts,
  resolveProgramWorkflowState,
} from "../../../src/niche/store/artifact-resolution.js";
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

describe("buildWorkflowErrorMessage", () => {
  it("produces expected format with command and flags", () => {
    const message = buildWorkflowErrorMessage({
      missing: "compilation record",
      nicheProgramId: "test-prog",
      command: "compile",
      flags: ["--source <paths...>"],
    });
    expect(message).toContain('Missing compilation record for niche program "test-prog".');
    expect(message).toContain(
      "Run: openclaw niche compile --niche-program-id test-prog --source <paths...>",
    );
  });

  it("omits flag suffix when no flags provided", () => {
    const message = buildWorkflowErrorMessage({
      missing: "benchmark results",
      nicheProgramId: "prog-2",
      command: "benchmark",
    });
    expect(message).toContain("Run: openclaw niche benchmark --niche-program-id prog-2");
    expect(message).not.toContain("--source");
  });
});

describe("resolveCompilationArtifacts", () => {
  it("throws with helpful message when no compilation exists", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("no-compile"));
      expect(() => resolveCompilationArtifacts("no-compile")).toThrow(
        /Missing compilation record for niche program "no-compile"/u,
      );
      expect(() => resolveCompilationArtifacts("no-compile")).toThrow(/openclaw niche compile/u);
    });
  });
});

describe("resolveManifestArtifacts", () => {
  it("throws with helpful message when no manifests exist", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("no-manifests"));
      expect(() => resolveManifestArtifacts("no-manifests")).toThrow(
        /Missing baseline manifest for niche program "no-manifests"/u,
      );
      expect(() => resolveManifestArtifacts("no-manifests")).toThrow(/openclaw niche compile/u);
    });
  });
});

describe("resolveBenchmarkArtifacts", () => {
  it("throws with helpful message when no benchmarks exist", async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("no-benchmarks"));
      expect(() => resolveBenchmarkArtifacts("no-benchmarks")).toThrow(
        /Missing benchmark results for niche program "no-benchmarks"/u,
      );
      expect(() => resolveBenchmarkArtifacts("no-benchmarks")).toThrow(/openclaw niche benchmark/u);
    });
  });
});

describe("resolveProgramWorkflowState", () => {
  it('returns "created" stage for a fresh program', async () => {
    await withTempHome(async () => {
      writeNicheProgram(makeProgram("fresh-prog"));
      const state = resolveProgramWorkflowState("fresh-prog");
      expect(state.currentStage).toBe("created");
      expect(state.program.niche_program_id).toBe("fresh-prog");
      expect(state.hasCompilation).toBe(false);
      expect(state.hasReadiness).toBe(false);
      expect(state.hasManifests).toBe(false);
      expect(state.hasBenchmarks).toBe(false);
      expect(state.hasActiveStack).toBe(false);
      expect(state.nextAction).toContain("Compile");
      expect(state.nextCommand).toContain("openclaw niche compile");
    });
  });

  it("throws when program doesn't exist", async () => {
    await withTempHome(async () => {
      expect(() => resolveProgramWorkflowState("nonexistent")).toThrow(
        /Niche program "nonexistent" not found/u,
      );
      expect(() => resolveProgramWorkflowState("nonexistent")).toThrow(/openclaw niche create/u);
    });
  });
});
