import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nicheCompileCommand } from "../../../src/commands/niche/compile.js";
import { nicheCreateCommand } from "../../../src/commands/niche/create.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { getBaselineManifest, getCandidateManifest } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-emit-manifests-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeProgramFile(dir: string): string {
  const programPath = path.join(dir, "niche-program.json");
  saveJsonFile(programPath, {
    niche_program_id: "emit-test",
    name: "Emit Manifests Test",
    objective: "Test the --emit-manifests flag.",
    risk_class: "low",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "anthropic",
        model_id: "claude-sonnet-4-5-20250514",
        api_mode: "messages",
      },
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read", "exec"],
    allowed_sources: [{ source_id: "repo-root", source_kind: "repos" }],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success",
        objective: "maximize",
        target_description: "Better task completion.",
        measurement_method: "benchmark grading",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store approved",
      training_policy: "train on approved",
      benchmark_policy: "held-out evals",
      retention_policy: "retain per governance",
      redaction_policy: "redact first",
      pii_policy: "no unreviewed PII",
      live_trace_reuse_policy: "embargo first",
      operator_review_required: false,
    },
  });
  return programPath;
}

function makeSourceFiles(dir: string): string[] {
  const sourcePaths: string[] = [];
  const makeRights = () => ({
    rights_to_store: true,
    rights_to_train: true,
    rights_to_benchmark: true,
    rights_to_derive: true,
    rights_to_distill: true,
    rights_to_generate_synthetic_from: true,
    retention_policy: "retain",
    redaction_status: "clean",
    pii_status: "none",
    provenance_status: "verified",
    data_zone: "dev",
  });

  const p1 = path.join(dir, "source-structured.json");
  saveJsonFile(p1, {
    sourceId: "doc-source",
    sourceKind: "repos",
    inputKind: "structured_text",
    title: "Repo docs",
    text: "Build verification and CI repair workflows.",
    accessPattern: "workspace",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "Verified.",
  });
  sourcePaths.push(p1);

  const p2 = path.join(dir, "source-seed.json");
  saveJsonFile(p2, {
    sourceId: "seed-1",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Seed benchmark",
    prompt: "Fix the CI build.",
    taskFamilyId: "ci-repair",
    passConditions: ["fixed"],
    hardFailConditions: ["unsafe"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "OK.",
  });
  sourcePaths.push(p2);

  const p3 = path.join(dir, "source-seed-2.json");
  saveJsonFile(p3, {
    sourceId: "seed-2",
    sourceKind: "domain_constraints",
    inputKind: "benchmark_seed",
    title: "Constraint seed",
    prompt: "Verify output is grounded.",
    taskFamilyId: "grounding",
    passConditions: ["grounded"],
    hardFailConditions: ["hallucinated"],
    accessPattern: "seed",
    rights: makeRights(),
    freshnessExpectation: "daily",
    trustNotes: "OK.",
  });
  sourcePaths.push(p3);

  return sourcePaths;
}

describe("niche compile --emit-manifests", () => {
  it("emits baseline and candidate manifests alongside compilation", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      await nicheCreateCommand({ programPath, json: false });

      const result = await nicheCompileCommand({
        nicheProgramId: "emit-test",
        sourcePaths,
        version: "v1",
        compiledAt: "2026-03-14T12:00:00.000Z",
        emitManifests: true,
        json: false,
      });

      // Verify manifest paths are in the result
      expect(result.baseline_manifest_path).toBeDefined();
      expect(result.candidate_manifest_path).toBeDefined();
      expect(result.baseline_manifest_path).toContain("baseline");
      expect(result.candidate_manifest_path).toContain("candidate");

      // Verify manifests are stored and schema-valid
      const baselineId = path.basename(result.baseline_manifest_path!, ".json");
      const candidateId = path.basename(result.candidate_manifest_path!, ".json");
      const baseline = getBaselineManifest(baselineId, process.env);
      const candidate = getCandidateManifest(candidateId, process.env);

      expect(baseline).not.toBeNull();
      expect(candidate).not.toBeNull();
      expect(baseline!.niche_program_id).toBe("emit-test");
      expect(candidate!.niche_program_id).toBe("emit-test");
      expect(candidate!.based_on_baseline_manifest_id).toBe(baseline!.baseline_manifest_id);
      expect(baseline!.provider).toBe("anthropic");
      expect(baseline!.model_id).toBe("claude-sonnet-4-5-20250514");
    });
  });

  it("does not emit manifests when flag is absent", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      await nicheCreateCommand({ programPath, json: false });

      const result = await nicheCompileCommand({
        nicheProgramId: "emit-test",
        sourcePaths,
        version: "v2",
        compiledAt: "2026-03-14T12:00:00.000Z",
        json: false,
      });

      expect(result.baseline_manifest_path).toBeUndefined();
      expect(result.candidate_manifest_path).toBeUndefined();
    });
  });
});
