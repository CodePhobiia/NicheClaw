import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Artifact,
  type ArtifactRightsState,
  type BaselineManifest,
  type CandidateManifest,
  type SourceAccessManifest,
} from "../../../src/niche/schema/index.js";
import {
  createArtifactRecord,
  getArtifactRecord,
  getBaselineManifest,
  getCandidateManifest,
  getSourceAccessManifest,
  listArtifactRecords,
  listBaselineManifests,
  listCandidateManifests,
  listSourceAccessManifests,
  resolveArtifactStorePath,
  resolveManifestStorePath,
  resolveNicheStateRoot,
  resolveNicheStoreRoots,
  writeBaselineManifest,
  writeCandidateManifest,
  writeSourceAccessManifest,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T10:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Baseline planner runtime for the control arm.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T09:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned same-model baseline.",
    sampling_config: {
      temperature: 0.2,
      top_p: 1,
    },
    prompt_asset_version: "2026.3.12-baseline",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-benchmark-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: {
      max_attempts: 1,
      backoff_policy: "none",
    },
    token_budget: {
      max_input_tokens: 64000,
      max_output_tokens: 8192,
      max_total_tokens: 72000,
    },
    context_budget: {
      max_context_tokens: 64000,
      max_retrieval_items: 8,
      max_exemplars: 3,
    },
    execution_mode: "benchmark",
    notes: "Control arm manifest.",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["read", "exec", "apply_patch"],
    tool_contract_version: "2026.3.12",
    retrieval_config: {
      retrieval_policy: "baseline",
    },
    verifier_config: {
      verifier_pack: "baseline",
    },
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T10:01:00.000Z",
    planner_runtime: {
      component_id: "planner-primary",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
      notes: "Candidate uses the same planner runtime family.",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T09:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned same-model candidate.",
    sampling_config: {
      temperature: 0.2,
      top_p: 1,
    },
    prompt_asset_version: "2026.3.12-candidate",
    grader_set_version: "2026.3.12",
    benchmark_suite_id: "repo-ci-benchmark-suite",
    source_access_manifest_id: "repo-ci-source-access",
    retry_policy: {
      max_attempts: 1,
      backoff_policy: "none",
    },
    token_budget: {
      max_input_tokens: 64000,
      max_output_tokens: 8192,
      max_total_tokens: 72000,
    },
    context_budget: {
      max_context_tokens: 64000,
      max_retrieval_items: 8,
      max_exemplars: 3,
    },
    execution_mode: "benchmark",
    notes: "Candidate manifest.",
    domain_pack_id: "repo-ci-specialist-pack",
    action_policy_id: "repo-ci-action-policy-v1",
    retrieval_stack_id: "repo-ci-retrieval-stack-v1",
    verifier_pack_id: "repo-ci-verifier-pack-v1",
    optional_student_model_ids: [],
    candidate_recipe: "repo-ci-candidate-recipe-v1",
  };
}

function makeSourceAccessManifest(): SourceAccessManifest {
  return {
    source_access_manifest_id: "repo-ci-source-access",
    allowed_tools: ["read", "exec", "apply_patch"],
    allowed_retrieval_indices: ["repo-index"],
    allowed_live_sources: ["ci-logs-live"],
    disallowed_sources: ["gold-eval-corpus"],
    sandbox_policy: "workspace_write",
    network_policy: "restricted",
    approval_policy: "operator_gated",
  };
}

function makeArtifact(): Artifact {
  return {
    artifact_id: "repo-ci-training-dataset",
    artifact_type: "dataset",
    version: "2026.3.12",
    producer: "niche-compiler",
    source_trace_refs: ["trace-repo-ci-001"],
    dataset_refs: ["seed-dataset-v1"],
    metrics: {
      example_count: 42,
      quality_score: 0.97,
    },
    created_at: "2026-03-12T10:05:00.000Z",
    lineage: [
      {
        parent_artifact_id: "seed-dataset-v1",
        relationship: "derived_from",
        derivation_step: "curation",
        notes: "Curated from approved source traces.",
      },
    ],
  };
}

function makeRightsState(): ArtifactRightsState {
  return {
    rights_to_store: true,
    rights_to_train: true,
    rights_to_benchmark: true,
    rights_to_derive: true,
    rights_to_distill: false,
    rights_to_generate_synthetic_from: true,
  };
}

describe("niche store paths", () => {
  it("resolves deterministic state roots and file paths", async () => {
    await withTempHome(async (home) => {
      const expectedRoot = path.join(home, ".openclaw", "niche");
      expect(resolveNicheStateRoot(process.env)).toBe(expectedRoot);
      expect(resolveNicheStoreRoots(process.env).artifacts).toBe(path.join(expectedRoot, "artifacts"));
      expect(resolveManifestStorePath("baseline", "baseline-manifest-repo-ci", process.env)).toBe(
        path.join(expectedRoot, "manifests", "baseline", "baseline-manifest-repo-ci.json"),
      );
      expect(
        resolveArtifactStorePath(
          {
            artifact_id: "repo-ci-training-dataset",
            artifact_type: "dataset",
            version: "2026.3.12",
            content_hash: "0123456789abcdef0123456789abcdef",
          },
          process.env,
        ),
      ).toBe(
        path.join(
          expectedRoot,
          "artifacts",
          "dataset",
          "repo-ci-training-dataset",
          "2026.3.12--0123456789abcdef0123456789abcdef.json",
        ),
      );
    });
  });
});

describe("manifest store", () => {
  it("writes, reads, and lists typed manifests without overwriting", async () => {
    await withTempHome(async () => {
      const baselinePath = writeBaselineManifest(makeBaselineManifest(), process.env);
      const candidatePath = writeCandidateManifest(makeCandidateManifest(), process.env);
      const sourceAccessPath = writeSourceAccessManifest(makeSourceAccessManifest(), process.env);

      expect(fs.existsSync(baselinePath)).toBe(true);
      expect(fs.existsSync(candidatePath)).toBe(true);
      expect(fs.existsSync(sourceAccessPath)).toBe(true);

      expect(getBaselineManifest("baseline-manifest-repo-ci", process.env)).toEqual(
        makeBaselineManifest(),
      );
      expect(getCandidateManifest("candidate-manifest-repo-ci", process.env)).toEqual(
        makeCandidateManifest(),
      );
      expect(getSourceAccessManifest("repo-ci-source-access", process.env)).toEqual(
        makeSourceAccessManifest(),
      );

      expect(listBaselineManifests(process.env)).toEqual([makeBaselineManifest()]);
      expect(listCandidateManifests(process.env)).toEqual([makeCandidateManifest()]);
      expect(listSourceAccessManifests(process.env)).toEqual([makeSourceAccessManifest()]);

      expect(() => writeBaselineManifest(makeBaselineManifest(), process.env)).toThrow(
        /Refusing to overwrite existing baseline manifest/u,
      );
    });
  });

  it("rejects invalid manifests before persistence", async () => {
    await withTempHome(async () => {
      const invalidManifest = {
        ...makeBaselineManifest(),
        benchmark_suite_id: "",
      };

      expect(() =>
        writeBaselineManifest(invalidManifest as unknown as BaselineManifest, process.env),
      ).toThrow(/Invalid baseline manifest/u);
    });
  });
});

describe("artifact registry", () => {
  it("creates, loads, lists, and verifies content-hash-backed artifact records", async () => {
    await withTempHome(async () => {
      const artifact = makeArtifact();
      const rightsState = makeRightsState();
      const { path: artifactPath, ref } = createArtifactRecord({
        artifact,
        rightsState,
        env: process.env,
      });

      expect(fs.existsSync(artifactPath)).toBe(true);

      const stored = getArtifactRecord(ref, process.env);
      expect(stored).toEqual({
        artifact,
        ref,
      });

      expect(listArtifactRecords({ env: process.env })).toEqual([
        {
          artifact,
          ref,
        },
      ]);

      fs.writeFileSync(
        artifactPath,
        `${JSON.stringify(
          {
            artifact: {
              ...artifact,
              metrics: {
                ...artifact.metrics,
                quality_score: 0.12,
              },
            },
            ref,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      expect(() => getArtifactRecord(ref, process.env)).toThrow(/Artifact hash mismatch/u);
    });
  });

  it("rejects duplicate artifact versions and invalid artifacts", async () => {
    await withTempHome(async () => {
      const artifact = makeArtifact();
      const rightsState = makeRightsState();
      createArtifactRecord({
        artifact,
        rightsState,
        env: process.env,
      });

      expect(() =>
        createArtifactRecord({
          artifact,
          rightsState,
          env: process.env,
        }),
      ).toThrow(/Refusing to overwrite existing artifact version/u);

      expect(() =>
        createArtifactRecord({
          artifact: {
            ...artifact,
            artifact_id: "",
          } as unknown as Artifact,
          rightsState,
          env: process.env,
        }),
      ).toThrow(/Invalid artifact/u);
    });
  });
});
