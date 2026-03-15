import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileDomainPack,
  materializeCompiledDomainPackArtifact,
  materializeNormalizedSourceArtifacts,
  normalizeSourceDescriptors,
  type SourceDescriptor,
} from "../../../src/niche/domain/index.js";
import { DomainPackSchema, type NicheProgram } from "../../../src/niche/schema/index.js";
import { getParentsForArtifact } from "../../../src/niche/store/index.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeNicheProgram(): NicheProgram {
  return {
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
  };
}

describe("domain source ingest and compiler", () => {
  it("normalizes mixed source inputs and preserves rights metadata", async () => {
    await withTempHome(async (home) => {
      const localFile = path.join(home, "local-source.txt");
      const repoRoot = path.join(home, "repo");
      const repoFile = path.join(repoRoot, "docs", "guide.md");
      await fs.mkdir(path.dirname(repoFile), { recursive: true });
      await fs.writeFile(localFile, " Local file content \r\n");
      await fs.writeFile(repoFile, " Repo asset content \n");

      const sources: SourceDescriptor[] = [
        {
          sourceId: "local-source",
          sourceKind: "documents",
          inputKind: "local_file",
          title: "Local Source",
          filePath: localFile,
          accessPattern: "read_only",
          rights: {
            rights_to_store: true,
            rights_to_train: false,
            rights_to_benchmark: true,
            rights_to_derive: true,
            rights_to_distill: false,
            rights_to_generate_synthetic_from: false,
            retention_policy: "retain",
            redaction_status: "clean",
            pii_status: "none",
            provenance_status: "verified",
            data_zone: "dev",
          },
        },
        {
          sourceId: "repo-source",
          sourceKind: "repos",
          inputKind: "repo_asset",
          title: "Repo Source",
          repoRoot,
          repoRelativePath: "docs/guide.md",
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
        },
        {
          sourceId: "seed-source",
          sourceKind: "human_examples",
          inputKind: "benchmark_seed",
          title: "Seed Source",
          prompt: "Diagnose the failing build and explain the root cause.",
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
        },
      ];

      const normalized = await normalizeSourceDescriptors(sources);
      expect(normalized.map((source) => source.sourceId)).toEqual([
        "local-source",
        "repo-source",
        "seed-source",
      ]);
      expect(normalized[0]?.rights.rights_to_train).toBe(false);
      expect(normalized[1]?.provenance.relative_path).toBe("docs/guide.md");
      expect(normalized[2]?.benchmarkSeed?.taskFamilyId).toBe("ci-repair");

      const compiled = compileDomainPack({
        nicheProgram: makeNicheProgram(),
        version: "v1.0.0",
        sources: normalized,
      });

      const validation = validateJsonSchemaValue({
        schema: DomainPackSchema,
        cacheKey: "niche-domain-pack-test",
        value: compiled.domainPack,
      });
      expect(validation.ok).toBe(true);
      expect(compiled.evidenceSourceRegistry).toHaveLength(3);
      expect(compiled.benchmarkSeedHints[0]?.taskFamilyId).toBe("ci-repair");
      expect(
        compiled.domainPack.failure_taxonomy.some(
          (failure) => failure.failure_id === "insufficient_training_rights",
        ),
      ).toBe(true);

      const compiledAgain = compileDomainPack({
        nicheProgram: makeNicheProgram(),
        version: "v1.0.0",
        sources: normalized,
      });
      expect(compiledAgain).toEqual(compiled);

      const sourceArtifacts = materializeNormalizedSourceArtifacts(normalized, process.env);
      const domainPackArtifact = materializeCompiledDomainPackArtifact({
        domainPack: compiled.domainPack,
        sourceArtifactRefs: sourceArtifacts.map((artifact) => artifact.ref),
        createdAt: "2026-03-12T12:00:00.000Z",
        env: process.env,
      });
      expect(getParentsForArtifact(domainPackArtifact.ref.artifact_id, process.env)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ parent_artifact_id: "local-source-dataset" }),
          expect.objectContaining({ parent_artifact_id: "repo-source-dataset" }),
          expect.objectContaining({ parent_artifact_id: "seed-source-dataset" }),
        ]),
      );
    });
  });

  it("rejects repo asset paths that escape the repo root", async () => {
    await withTempHome(async (home) => {
      const escapedRoot = path.join(home, "repo-escape");
      await fs.mkdir(escapedRoot, { recursive: true });
      await fs.writeFile(path.join(escapedRoot, "secret.txt"), "secret\n");

      const sources: SourceDescriptor[] = [
        {
          sourceId: "repo-source",
          sourceKind: "repos",
          inputKind: "repo_asset",
          title: "Repo Source",
          repoRoot: path.join(home, "repo"),
          repoRelativePath: "../escape.txt",
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
        },
      ];

      await expect(normalizeSourceDescriptors(sources)).rejects.toThrow(/escapes repo root/u);
    });
  });

  it("rejects sibling-prefix repo asset escapes that share the same path prefix", async () => {
    await withTempHome(async (home) => {
      const repoRoot = path.join(home, "repo");
      const escapedRoot = path.join(home, "repo-escape");
      await fs.mkdir(repoRoot, { recursive: true });
      await fs.mkdir(escapedRoot, { recursive: true });
      await fs.writeFile(path.join(escapedRoot, "secret.txt"), "secret\n");

      await expect(
        normalizeSourceDescriptors([
          {
            sourceId: "repo-source",
            sourceKind: "repos",
            inputKind: "repo_asset",
            title: "Repo Source",
            repoRoot,
            repoRelativePath: "../repo-escape/secret.txt",
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
          },
        ]),
      ).rejects.toThrow(/escapes repo root/u);
    });
  });
});
