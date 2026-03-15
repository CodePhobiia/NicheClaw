import { createSubsystemLogger } from "../../logging/subsystem.js";
import type {
  Artifact,
  ArtifactRef,
  CandidateRecipe,
  CandidateRecipeStep,
} from "../schema/index.js";
import { getArtifactRecord } from "../store/index.js";
import type { OptimizerJobExecutionResult } from "./job-executor.js";
import type { OptimizerJob } from "./job-model.js";
import { materializeOptimizerArtifact, type OptimizerLineageParent } from "./lineage-runtime.js";

const log = createSubsystemLogger("niche/optimizer/candidate-generation");

/**
 * Resolves all input dataset refs from the artifact store. Returns the
 * resolved parent refs or an error message when any input is missing.
 */
function resolveInputDatasets(params: {
  inputDatasetRefs: ArtifactRef[];
  env?: NodeJS.ProcessEnv;
}): { parentRefs: ArtifactRef[]; error?: string } {
  const parentRefs: ArtifactRef[] = [];
  for (const ref of params.inputDatasetRefs) {
    const stored = getArtifactRecord(ref, params.env);
    if (!stored) {
      return {
        parentRefs: [],
        error: `Input dataset ${ref.artifact_id} is not present in the artifact store.`,
      };
    }
    parentRefs.push(stored.ref);
  }
  return { parentRefs };
}

/**
 * Builds lineage parent entries from resolved input dataset refs, scoped to
 * a specific recipe step.
 */
function buildLineageParents(params: {
  parentRefs: ArtifactRef[];
  stepId: string;
  jobId: string;
}): OptimizerLineageParent[] {
  return params.parentRefs.map((ref) => ({
    artifact_ref: ref,
    relationship: "derived_from",
    derivation_step: `candidate_generation_${params.stepId}`,
    notes: `Produced by candidate generation step ${params.stepId} in job ${params.jobId}.`,
  }));
}

/**
 * Processes a single recipe step by materializing each output artifact ref
 * as a derived artifact with lineage from the resolved input datasets.
 */
function processRecipeStep(params: {
  step: CandidateRecipeStep;
  parentRefs: ArtifactRef[];
  recipe: CandidateRecipe;
  job: OptimizerJob;
  env?: NodeJS.ProcessEnv;
}): ArtifactRef[] {
  const { step, parentRefs, recipe, job, env } = params;
  const producedRefs: ArtifactRef[] = [];

  for (const outputRef of step.output_artifact_refs) {
    const artifact: Artifact = {
      artifact_id: outputRef.artifact_id,
      artifact_type: outputRef.artifact_type,
      version: outputRef.version,
      producer: `candidate_generation/${recipe.candidate_recipe_id}`,
      source_trace_refs: [],
      dataset_refs: recipe.input_dataset_refs.map((ref) => ref.artifact_id),
      metrics: {},
      created_at: outputRef.created_at,
      lineage: [],
    };

    const lineageParents = buildLineageParents({
      parentRefs,
      stepId: step.step_id,
      jobId: job.job_id,
    });

    const materialized = materializeOptimizerArtifact({
      artifact,
      parents: lineageParents,
      env,
    });

    producedRefs.push(materialized.ref);
  }

  return producedRefs;
}

/**
 * Executes a candidate generation recipe by resolving input datasets from the
 * artifact store, then materializing derived artifacts for each distillation
 * and sidecar training step. Each output artifact inherits governed_data_status
 * and rights from its parent input datasets.
 *
 * Returns a completed status with all produced artifact refs, or a failed
 * status if inputs are missing or materialization encounters an error.
 */
export function executeCandidateGeneration(params: {
  job: OptimizerJob;
  recipe: CandidateRecipe;
  env?: NodeJS.ProcessEnv;
}): OptimizerJobExecutionResult {
  const { job, recipe, env } = params;

  if (job.status !== "ready") {
    return {
      job_id: job.job_id,
      status: job.status,
      result_metadata: null,
      error: `Job ${job.job_id} is not in ready status (current: ${job.status}).`,
    };
  }

  const hasBlockingChecks = job.governance_checks.some((check) => check.blocking && !check.passed);
  if (hasBlockingChecks) {
    return {
      job_id: job.job_id,
      status: "blocked",
      result_metadata: null,
      error: `Job ${job.job_id} has blocking governance checks.`,
    };
  }

  log.info(
    `Executing candidate generation for recipe ${recipe.candidate_recipe_id} (job ${job.job_id})`,
  );

  // Resolve all input datasets from the artifact store
  const { parentRefs, error: resolveError } = resolveInputDatasets({
    inputDatasetRefs: recipe.input_dataset_refs,
    env,
  });
  if (resolveError) {
    log.warn(`Input resolution failed for job ${job.job_id}: ${resolveError}`);
    return {
      job_id: job.job_id,
      status: "failed",
      result_metadata: null,
      error: resolveError,
    };
  }

  const allProducedRefs: ArtifactRef[] = [];

  // Process distillation steps
  for (const step of recipe.distillation_steps) {
    try {
      const refs = processRecipeStep({
        step,
        parentRefs,
        recipe,
        job,
        env,
      });
      allProducedRefs.push(...refs);
    } catch (err) {
      log.warn(`Distillation step ${step.step_id} failed for job ${job.job_id}: ${String(err)}`);
      return {
        job_id: job.job_id,
        status: "failed",
        result_metadata: null,
        error: `Distillation step ${step.step_id} failed: ${String(err)}`,
      };
    }
  }

  // Process sidecar training steps
  for (const step of recipe.sidecar_training_steps) {
    try {
      const refs = processRecipeStep({
        step,
        parentRefs,
        recipe,
        job,
        env,
      });
      allProducedRefs.push(...refs);
    } catch (err) {
      log.warn(
        `Sidecar training step ${step.step_id} failed for job ${job.job_id}: ${String(err)}`,
      );
      return {
        job_id: job.job_id,
        status: "failed",
        result_metadata: null,
        error: `Sidecar training step ${step.step_id} failed: ${String(err)}`,
      };
    }
  }

  if (allProducedRefs.length === 0) {
    return {
      job_id: job.job_id,
      status: "failed",
      result_metadata: null,
      error:
        "Recipe produced no artifacts (no distillation or sidecar training steps with outputs).",
    };
  }

  return {
    job_id: job.job_id,
    status: "completed",
    result_metadata: {
      produced_artifact_refs: allProducedRefs,
      notes: `Candidate generation produced ${allProducedRefs.length} artifact(s) from recipe ${recipe.candidate_recipe_id}.`,
    },
  };
}
