import { describe, expect, it } from "vitest";
import { executeCandidateGeneration } from "../../../src/niche/optimizer/index.js";
import type { OptimizerJob } from "../../../src/niche/optimizer/index.js";
import type {
  ArtifactRef,
  ArtifactRightsState,
  CandidateRecipe,
} from "../../../src/niche/schema/index.js";
import {
  createArtifactRecord,
  getArtifactRecord,
  getParentsForArtifact,
  writeLineageEdges,
} from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const ALL_RIGHTS: ArtifactRightsState = {
  rights_to_store: true,
  rights_to_train: true,
  rights_to_benchmark: true,
  rights_to_derive: true,
  rights_to_distill: true,
  rights_to_generate_synthetic_from: true,
};

const RESTRICTED_RIGHTS: ArtifactRightsState = {
  rights_to_store: true,
  rights_to_train: true,
  rights_to_benchmark: true,
  rights_to_derive: true,
  rights_to_distill: false,
  rights_to_generate_synthetic_from: false,
};

/**
 * Creates a parent artifact in the store and returns the real stored ref
 * (with a computed content_hash) so that downstream code can resolve it.
 */
function createParentInStore(params: {
  id: string;
  type?: ArtifactRef["artifact_type"];
  rights?: ArtifactRightsState;
  env: NodeJS.ProcessEnv;
}): ArtifactRef {
  const { id, type = "dataset", rights = ALL_RIGHTS, env } = params;
  const { ref } = createArtifactRecord({
    artifact: {
      artifact_id: id,
      artifact_type: type,
      version: "2026.3.14",
      producer: "test-ingest",
      source_trace_refs: [],
      dataset_refs: [],
      metrics: {},
      governed_data_status: {
        data_zone: "dev",
        retention_policy: "retain_for_90_days",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        quarantined: false,
      },
      created_at: "2026-03-14T10:00:00.000Z",
      lineage: [],
    },
    rightsState: rights,
    env,
  });
  // Give the artifact authoritative lineage so the orchestrator can resolve it
  writeLineageEdges(
    id,
    [
      {
        parent_artifact_id: "root-source",
        relationship: "derived_from",
        derivation_step: "ingest",
        notes: "Root source.",
      },
    ],
    env,
  );
  return ref;
}

/**
 * Builds an output artifact ref stub for a recipe step. The content_hash
 * here is a placeholder; the executor will compute the real one when
 * materializing the artifact, so what matters is the artifact_id and type.
 */
function makeOutputArtifactRef(
  id: string,
  type: ArtifactRef["artifact_type"] = "student_model",
): ArtifactRef {
  return {
    artifact_id: id,
    artifact_type: type,
    version: "2026.3.14",
    // Placeholder hash - the executor builds fresh artifacts with real hashes
    content_hash: "a".repeat(64),
    rights_state: ALL_RIGHTS,
    created_at: "2026-03-14T10:05:00.000Z",
  };
}

function makeRecipe(params: {
  inputDatasetRefs: ArtifactRef[];
  distillationOutputRefs?: ArtifactRef[];
  sidecarOutputRefs?: ArtifactRef[];
}): CandidateRecipe {
  return {
    candidate_recipe_id: "test-recipe-001",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-14T10:00:00.000Z",
    recipe_type: "distillation",
    teacher_runtimes: ["openai/gpt-4o"],
    input_dataset_refs: params.inputDatasetRefs,
    synthesis_prompt_refs: [],
    distillation_steps: params.distillationOutputRefs
      ? [
          {
            step_id: "distill-step-1",
            summary: "Distill teacher outputs into student artifacts.",
            output_artifact_refs: params.distillationOutputRefs,
          },
        ]
      : [],
    sidecar_training_steps: params.sidecarOutputRefs
      ? [
          {
            step_id: "sidecar-step-1",
            summary: "Train sidecar model from distilled artifacts.",
            output_artifact_refs: params.sidecarOutputRefs,
          },
        ]
      : [],
    verifier_training_steps: [],
    retrieval_optimization_steps: [],
    hyperparameters: { learning_rate: 0.001 },
    grader_refs: params.inputDatasetRefs,
    evaluation_inputs: params.inputDatasetRefs,
    promotion_inputs: params.inputDatasetRefs,
  };
}

function makeReadyJob(artifactRefs: ArtifactRef[]): OptimizerJob {
  return {
    job_id: "test-candgen-job-001",
    job_type: "candidate_generation",
    status: "ready",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-14T10:00:00.000Z",
    artifact_refs: artifactRefs,
    governance_checks: [
      {
        check_id: "store-binding",
        passed: true,
        blocking: true,
        message: "All inputs present.",
      },
    ],
    input_summary: "Generate candidate from test recipe.",
    reward_artifact_ids: [],
  };
}

describe("candidate generation executor", () => {
  it("executes recipe and produces artifacts with lineage", async () => {
    await withTempHome(async () => {
      const inputRef = createParentInStore({
        id: "input-dataset-v1",
        env: process.env,
      });

      const distillOutputRef = makeOutputArtifactRef("distill-output-v1");
      const recipe = makeRecipe({
        inputDatasetRefs: [inputRef],
        distillationOutputRefs: [distillOutputRef],
      });

      const job = makeReadyJob([inputRef]);

      const result = executeCandidateGeneration({
        job,
        recipe,
        env: process.env,
      });

      expect(result.status).toBe("completed");
      expect(result.result_metadata).not.toBeNull();
      expect(result.result_metadata?.produced_artifact_refs).toHaveLength(1);
      expect(result.result_metadata?.produced_artifact_refs[0].artifact_id).toBe(
        "distill-output-v1",
      );
      expect(result.result_metadata?.notes).toContain("test-recipe-001");

      // Verify the artifact was stored
      const storedOutput = getArtifactRecord(
        result.result_metadata!.produced_artifact_refs[0],
        process.env,
      );
      expect(storedOutput).not.toBeNull();
      expect(storedOutput?.artifact.producer).toBe("candidate_generation/test-recipe-001");

      // Verify lineage edges were written
      const lineage = getParentsForArtifact("distill-output-v1", process.env);
      expect(lineage).toHaveLength(1);
      expect(lineage[0].parent_artifact_id).toBe("input-dataset-v1");
      expect(lineage[0].derivation_step).toBe("candidate_generation_distill-step-1");
    });
  });

  it("produces artifacts from both distillation and sidecar steps", async () => {
    await withTempHome(async () => {
      const inputRef = createParentInStore({
        id: "input-dataset-v2",
        env: process.env,
      });

      const distillRef = makeOutputArtifactRef("distill-out-v2");
      const sidecarRef = makeOutputArtifactRef("sidecar-out-v2");
      const recipe = makeRecipe({
        inputDatasetRefs: [inputRef],
        distillationOutputRefs: [distillRef],
        sidecarOutputRefs: [sidecarRef],
      });

      const job = makeReadyJob([inputRef]);

      const result = executeCandidateGeneration({
        job,
        recipe,
        env: process.env,
      });

      expect(result.status).toBe("completed");
      expect(result.result_metadata?.produced_artifact_refs).toHaveLength(2);

      const producedIds = result.result_metadata!.produced_artifact_refs.map(
        (ref) => ref.artifact_id,
      );
      expect(producedIds).toContain("distill-out-v2");
      expect(producedIds).toContain("sidecar-out-v2");
    });
  });

  it("fails when input datasets are missing from store", async () => {
    await withTempHome(async () => {
      // Build a fake ref that looks valid but is not stored
      const missingRef: ArtifactRef = {
        artifact_id: "missing-dataset-v1",
        artifact_type: "dataset",
        version: "2026.3.14",
        content_hash: "b".repeat(64),
        rights_state: ALL_RIGHTS,
        created_at: "2026-03-14T10:00:00.000Z",
      };

      const distillRef = makeOutputArtifactRef("distill-orphan-v1");
      const recipe = makeRecipe({
        inputDatasetRefs: [missingRef],
        distillationOutputRefs: [distillRef],
      });

      const job = makeReadyJob([missingRef]);

      const result = executeCandidateGeneration({
        job,
        recipe,
        env: process.env,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("missing-dataset-v1");
      expect(result.error).toContain("not present in the artifact store");
      expect(result.result_metadata).toBeNull();
    });
  });

  it("propagates restricted rights from parents", async () => {
    await withTempHome(async () => {
      const restrictedRef = createParentInStore({
        id: "restricted-dataset-v1",
        rights: RESTRICTED_RIGHTS,
        env: process.env,
      });

      const outputRef = makeOutputArtifactRef("derived-restricted-v1");
      const recipe = makeRecipe({
        inputDatasetRefs: [restrictedRef],
        distillationOutputRefs: [outputRef],
      });

      const job = makeReadyJob([restrictedRef]);

      const result = executeCandidateGeneration({
        job,
        recipe,
        env: process.env,
      });

      expect(result.status).toBe("completed");
      expect(result.result_metadata?.produced_artifact_refs).toHaveLength(1);

      const storedOutput = getArtifactRecord(
        result.result_metadata!.produced_artifact_refs[0],
        process.env,
      );
      expect(storedOutput).not.toBeNull();
      // Rights should propagate: distill and generate_synthetic_from are false on parent
      expect(storedOutput?.ref.rights_state.rights_to_distill).toBe(false);
      expect(storedOutput?.ref.rights_state.rights_to_generate_synthetic_from).toBe(false);
      // Other rights remain true
      expect(storedOutput?.ref.rights_state.rights_to_store).toBe(true);
      expect(storedOutput?.ref.rights_state.rights_to_train).toBe(true);
      expect(storedOutput?.ref.rights_state.rights_to_benchmark).toBe(true);
      expect(storedOutput?.ref.rights_state.rights_to_derive).toBe(true);
    });
  });

  it("rejects non-ready jobs", async () => {
    await withTempHome(async () => {
      const inputRef: ArtifactRef = {
        artifact_id: "input-blocked-v1",
        artifact_type: "dataset",
        version: "2026.3.14",
        content_hash: "c".repeat(64),
        rights_state: ALL_RIGHTS,
        created_at: "2026-03-14T10:00:00.000Z",
      };
      const recipe = makeRecipe({
        inputDatasetRefs: [inputRef],
        distillationOutputRefs: [makeOutputArtifactRef("out-blocked-v1")],
      });

      const job: OptimizerJob = {
        ...makeReadyJob([inputRef]),
        status: "blocked",
        blocked_reason: "Missing governance approval.",
      };

      const result = executeCandidateGeneration({
        job,
        recipe,
        env: process.env,
      });

      expect(result.status).toBe("blocked");
      expect(result.error).toContain("not in ready status");
    });
  });

  it("fails when recipe has no distillation or sidecar steps", async () => {
    await withTempHome(async () => {
      const inputRef = createParentInStore({
        id: "input-empty-v1",
        env: process.env,
      });

      // Recipe with no distillation or sidecar steps
      const recipe = makeRecipe({
        inputDatasetRefs: [inputRef],
      });

      const job = makeReadyJob([inputRef]);

      const result = executeCandidateGeneration({
        job,
        recipe,
        env: process.env,
      });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("no artifacts");
    });
  });
});
