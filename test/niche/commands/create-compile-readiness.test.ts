import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nicheCompileCommand } from "../../../src/commands/niche/compile.js";
import { nicheCreateCommand } from "../../../src/commands/niche/create.js";
import { nicheReadinessCommand } from "../../../src/commands/niche/readiness.js";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import {
  getLatestNicheCompilationRecordForProgram,
  getNicheProgram,
  getReadinessReportForProgram,
  listSourceAccessManifests,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-compile-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeProgramFile(dir: string): string {
  const programPath = path.join(dir, "niche-program.json");
  saveJsonFile(programPath, {
    niche_program_id: "repo-ci-specialist",
    name: "Repo CI Specialist",
    objective: "Improve repo and CI execution quality.",
    risk_class: "moderate",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "openai",
        model_id: "gpt-5",
        api_mode: "responses",
        notes: "Primary planner runtime.",
      },
      retrieval_components: [],
      verifier_components: [],
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read", "exec", "apply_patch"],
    allowed_sources: [
      {
        source_id: "repo-root",
        source_kind: "repos",
        description: "Primary repo.",
        access_pattern: "workspace",
      },
    ],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success",
        objective: "maximize",
        target_description: "Improve held-out task completion.",
        measurement_method: "benchmark grading",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store approved sources",
      training_policy: "train only on approved sources",
      benchmark_policy: "keep eval sources held out",
      retention_policy: "retain according to governance policy",
      redaction_policy: "redact sensitive material first",
      pii_policy: "avoid unreviewed PII",
      live_trace_reuse_policy: "embargo live traces before reuse",
      operator_review_required: true,
    },
  });
  return programPath;
}

function makeSourceFiles(dir: string): string[] {
  const structuredPath = path.join(dir, "structured-source.json");
  const benchmarkSeedPath = path.join(dir, "benchmark-seed.json");
  saveJsonFile(structuredPath, {
    sourceId: "repo-source",
    sourceKind: "repos",
    inputKind: "structured_text",
    title: "Repo Source",
    text: "The repo requires grounded build and test verification before delivery.",
    accessPattern: "workspace",
    rights: {
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
    },
    freshnessExpectation: "daily",
    trustNotes: "Approved repo guidance.",
  });
  saveJsonFile(benchmarkSeedPath, {
    sourceId: "benchmark-seed-source",
    sourceKind: "human_examples",
    inputKind: "benchmark_seed",
    title: "Benchmark Seed Source",
    prompt: "Reproduce the failing CI build and explain the root cause.",
    taskFamilyId: "ci-repair",
    passConditions: ["correct_root_cause"],
    hardFailConditions: ["unsafe_command_use"],
    accessPattern: "seed",
    rights: {
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
    },
    freshnessExpectation: "daily",
    trustNotes: "Approved benchmark seed.",
  });
  return [structuredPath, benchmarkSeedPath];
}

describe("niche create, compile, and readiness commands", () => {
  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  it("stores a niche program and compiles system-owned domain, source-access, and readiness artifacts", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const sourcePaths = makeSourceFiles(dir);

      const created = await nicheCreateCommand({
        programPath,
        json: false,
      });
      const compiled = await nicheCompileCommand({
        nicheProgramId: "repo-ci-specialist",
        sourcePaths,
        version: "compile-v1",
        compiledAt: "2026-03-13T10:00:00.000Z",
        json: false,
      });
      const compiledAgain = await nicheCompileCommand({
        nicheProgramId: "repo-ci-specialist",
        sourcePaths,
        version: "compile-v1",
        compiledAt: "2026-03-13T10:00:00.000Z",
        json: false,
      });
      const readiness = await nicheReadinessCommand({
        nicheProgramId: "repo-ci-specialist",
        json: false,
      });

      expect(created.niche_program_id).toBe("repo-ci-specialist");
      expect(getNicheProgram("repo-ci-specialist", process.env)?.name).toBe("Repo CI Specialist");
      expect(compiled.compilation.version).toBe("compile-v1");
      expect(compiled.compilation.normalized_sources).toHaveLength(2);
      expect(compiled.compilation.source_artifact_refs).toHaveLength(2);
      expect(compiled.compilation.source_access_manifest.allowed_tools).toEqual([
        "apply_patch",
        "exec",
        "read",
      ]);
      expect(compiled.compilation.readiness_report.status).toMatch(/ready/);
      expect(compiledAgain.compilation_record_path).toBe(compiled.compilation_record_path);
      expect(compiledAgain.source_access_manifest_path).toBe(compiled.source_access_manifest_path);
      expect(readiness.readiness_report.readiness_report_id).toBe("repo-ci-specialist-readiness");
      expect(getLatestNicheCompilationRecordForProgram("repo-ci-specialist", process.env)).toEqual(
        compiled.compilation,
      );
      expect(getReadinessReportForProgram("repo-ci-specialist", process.env)).toEqual(
        compiled.compilation.readiness_report,
      );
      expect(listSourceAccessManifests(process.env)).toEqual([
        compiled.compilation.source_access_manifest,
      ]);
    });
  });

  it("rejects compile inputs from held-out or quarantined data zones", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const programPath = makeProgramFile(dir);
      const blockedSourcePath = path.join(dir, "blocked-source.json");
      saveJsonFile(blockedSourcePath, {
        sourceId: "gold-eval-source",
        sourceKind: "datasets",
        inputKind: "structured_text",
        title: "Gold Eval Source",
        text: "Held-out benchmark material.",
        accessPattern: "frozen",
        rights: {
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
          data_zone: "gold_eval",
        },
      });

      await nicheCreateCommand({
        programPath,
      });

      await expect(
        nicheCompileCommand({
          nicheProgramId: "repo-ci-specialist",
          sourcePaths: [blockedSourcePath],
        }),
      ).rejects.toThrow(/cannot be compiled from data zone gold_eval/u);
    });
  });
});
