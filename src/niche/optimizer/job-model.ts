import { computeStableContentHash } from "../benchmark/index.js";
import type { ArtifactRef } from "../schema/index.js";

export const OPTIMIZER_JOB_TYPES = [
  "candidate_generation",
  "teacher_rollout",
  "verifier_refresh",
  "evaluation_preparation",
] as const;

export const OPTIMIZER_JOB_STATUSES = [
  "queued",
  "ready",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const;

export type OptimizerJobType = (typeof OPTIMIZER_JOB_TYPES)[number];
export type OptimizerJobStatus = (typeof OPTIMIZER_JOB_STATUSES)[number];

export type OptimizerGovernanceCheck = {
  check_id: string;
  passed: boolean;
  blocking: boolean;
  message: string;
};

export type OptimizerJobResultMetadata = {
  produced_artifact_refs: ArtifactRef[];
  notes?: string;
};

export type OptimizerJob = {
  job_id: string;
  job_type: OptimizerJobType;
  status: OptimizerJobStatus;
  niche_program_id: string;
  created_at: string;
  artifact_refs: ArtifactRef[];
  governance_checks: OptimizerGovernanceCheck[];
  input_summary: string;
  reward_artifact_ids: string[];
  blocked_reason?: string;
  result_metadata?: OptimizerJobResultMetadata;
};

export function buildOptimizerJobId(params: {
  jobType: OptimizerJobType;
  nicheProgramId: string;
  createdAt: string;
  artifactRefs: ArtifactRef[];
}): string {
  return computeStableContentHash({
    jobType: params.jobType,
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: params.artifactRefs.map((ref) => ({
      artifactId: ref.artifact_id,
      artifactType: ref.artifact_type,
      version: ref.version,
    })),
  });
}
