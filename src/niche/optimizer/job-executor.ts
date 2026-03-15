import { createSubsystemLogger } from "../../logging/subsystem.js";
import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import { propagateDerivedRights } from "../domain/rights-propagation.js";
import type { Artifact, ArtifactRef } from "../schema/index.js";
import { createArtifactRecord, writeLineageEdges } from "../store/index.js";
import type { OptimizerJob, OptimizerJobResultMetadata } from "./job-model.js";

const log = createSubsystemLogger("niche/optimizer/executor");

export type OptimizerJobExecutionResult = {
  job_id: string;
  status: OptimizerJob["status"];
  result_metadata: OptimizerJobResultMetadata | null;
  error?: string;
};

export type CandidateGenerationExecutor = (params: {
  job: OptimizerJob;
  env?: NodeJS.ProcessEnv;
}) => CandidateGenerationOutput | null;

export type CandidateGenerationOutput = {
  artifacts: Array<{
    artifact: Artifact;
    parent_refs: ArtifactRef[];
  }>;
  notes?: string;
};

function materializeOutputArtifacts(params: {
  output: CandidateGenerationOutput;
  job: OptimizerJob;
  env?: NodeJS.ProcessEnv;
}): ArtifactRef[] {
  const producedRefs: ArtifactRef[] = [];

  for (const entry of params.output.artifacts) {
    if (entry.parent_refs.length === 0) {
      log.warn(`Skipping artifact ${entry.artifact.artifact_id}: no parent refs for lineage.`);
      continue;
    }

    const lineageRefs = entry.parent_refs.map((parentRef) => ({
      parent_artifact_id: parentRef.artifact_id,
      relationship: "derived_from",
      derivation_step: `optimizer_${params.job.job_type}`,
      notes: `Produced by optimizer job ${params.job.job_id}.`,
    }));

    const rightsState = propagateDerivedRights(
      entry.parent_refs.map((ref) => ref.rights_state),
    ).rightsState;

    const artifactRecord = createArtifactRecord({
      artifact: {
        ...entry.artifact,
        lineage: lineageRefs,
      },
      rightsState,
      env: params.env,
    });

    writeLineageEdges(entry.artifact.artifact_id, lineageRefs, params.env);

    producedRefs.push(artifactRecord.ref);
  }

  return producedRefs;
}

export function executeOptimizerJob(params: {
  job: OptimizerJob;
  executor: CandidateGenerationExecutor;
  env?: NodeJS.ProcessEnv;
}): OptimizerJobExecutionResult {
  const { job, executor, env } = params;

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

  log.info(`Executing optimizer job ${job.job_id} (${job.job_type})`);

  let output: CandidateGenerationOutput | null;
  try {
    output = executor({ job, env });
  } catch (err) {
    log.warn(`Executor failed for job ${job.job_id}: ${String(err)}`);
    return {
      job_id: job.job_id,
      status: "failed",
      result_metadata: null,
      error: String(err),
    };
  }

  if (!output || output.artifacts.length === 0) {
    return {
      job_id: job.job_id,
      status: "failed",
      result_metadata: null,
      error: "Executor produced no artifacts.",
    };
  }

  let producedRefs: ArtifactRef[];
  try {
    producedRefs = materializeOutputArtifacts({ output, job, env });
  } catch (err) {
    log.warn(`Artifact materialization failed for job ${job.job_id}: ${String(err)}`);
    return {
      job_id: job.job_id,
      status: "failed",
      result_metadata: null,
      error: `Artifact materialization failed: ${String(err)}`,
    };
  }

  if (producedRefs.length === 0) {
    return {
      job_id: job.job_id,
      status: "failed",
      result_metadata: null,
      error: "All artifact materializations were skipped (no lineage parents).",
    };
  }

  const resultMetadata: OptimizerJobResultMetadata = {
    produced_artifact_refs: producedRefs,
    notes: output.notes ?? `Produced ${producedRefs.length} artifact(s).`,
  };

  return {
    job_id: job.job_id,
    status: "completed",
    result_metadata: resultMetadata,
  };
}
