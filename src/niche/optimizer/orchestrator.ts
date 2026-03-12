import type { ArtifactRef, CandidateRecipe } from "../schema/index.js";
import type { TeacherRolloutRequest } from "./data-synthesis.js";
import {
  buildOptimizerJobId,
  type OptimizerGovernanceCheck,
  type OptimizerJob,
} from "./job-model.js";
import { getRewardCalibrationMetadata } from "./reward-registry.js";

function resolveStatus(
  checks: OptimizerGovernanceCheck[],
): OptimizerJob["status"] {
  return checks.some((check) => check.blocking && !check.passed) ? "blocked" : "ready";
}

function finalizeJob(params: {
  jobType: OptimizerJob["job_type"];
  nicheProgramId: string;
  createdAt: string;
  artifactRefs: ArtifactRef[];
  governanceChecks: OptimizerGovernanceCheck[];
  inputSummary: string;
  rewardArtifactIds?: string[];
}): OptimizerJob {
  const rewardArtifactIds = params.rewardArtifactIds ?? [];
  const status = resolveStatus(params.governanceChecks);
  return {
    job_id: buildOptimizerJobId({
      jobType: params.jobType,
      nicheProgramId: params.nicheProgramId,
      createdAt: params.createdAt,
      artifactRefs: params.artifactRefs,
    }),
    job_type: params.jobType,
    status,
    niche_program_id: params.nicheProgramId,
    created_at: params.createdAt,
    artifact_refs: params.artifactRefs,
    governance_checks: params.governanceChecks,
    input_summary: params.inputSummary,
    reward_artifact_ids: rewardArtifactIds,
    blocked_reason:
      status === "blocked"
        ? params.governanceChecks.find((check) => check.blocking && !check.passed)?.message
        : undefined,
  };
}

function buildRewardChecks(params: {
  rewardArtifactIds?: string[];
  promotionEligibleFlow: boolean;
  env?: NodeJS.ProcessEnv;
}): OptimizerGovernanceCheck[] {
  const rewardArtifactIds = params.rewardArtifactIds ?? [];
  return rewardArtifactIds.map((rewardArtifactId) => {
    const calibration = getRewardCalibrationMetadata(rewardArtifactId, params.env);
    const passed =
      !params.promotionEligibleFlow ||
      (calibration?.promotion_eligible === true &&
        calibration.sme_sample_count >= calibration.required_sme_sample_count);
    return {
      check_id: `reward-calibration-${rewardArtifactId}`,
      passed,
      blocking: params.promotionEligibleFlow,
      message: passed
        ? `Reward artifact ${rewardArtifactId} is calibrated for this flow.`
        : `Reward artifact ${rewardArtifactId} lacks promotion-eligible calibration metadata.`,
    };
  });
}

export function planCandidateGenerationJob(params: {
  nicheProgramId: string;
  createdAt: string;
  candidateRecipe: CandidateRecipe;
  candidateRecipeRef: ArtifactRef;
  rewardArtifactIds?: string[];
  promotionEligibleFlow: boolean;
  env?: NodeJS.ProcessEnv;
}): OptimizerJob {
  const checks: OptimizerGovernanceCheck[] = [
    {
      check_id: "candidate-recipe-train-rights",
      passed: params.candidateRecipe.input_dataset_refs.every(
        (ref) => ref.rights_state.rights_to_train,
      ),
      blocking: true,
      message: params.candidateRecipe.input_dataset_refs.every(
        (ref) => ref.rights_state.rights_to_train,
      )
        ? "All candidate recipe datasets retain rights_to_train."
        : "Candidate generation requires datasets with rights_to_train.",
    },
    ...buildRewardChecks({
      rewardArtifactIds: params.rewardArtifactIds,
      promotionEligibleFlow: params.promotionEligibleFlow,
      env: params.env,
    }),
  ];

  return finalizeJob({
    jobType: "candidate_generation",
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: [params.candidateRecipeRef],
    governanceChecks: checks,
    inputSummary: `Generate candidate artifacts from recipe ${params.candidateRecipe.candidate_recipe_id}.`,
    rewardArtifactIds: params.rewardArtifactIds,
  });
}

export function planTeacherRolloutJob(params: {
  nicheProgramId: string;
  createdAt: string;
  rolloutRequest: TeacherRolloutRequest;
  rewardArtifactIds?: string[];
  promotionEligibleFlow: boolean;
  env?: NodeJS.ProcessEnv;
}): OptimizerJob {
  const checks: OptimizerGovernanceCheck[] = [
    {
      check_id: "teacher-rollout-embargo",
      passed: params.rolloutRequest.embargo_status === "cleared",
      blocking: true,
      message:
        params.rolloutRequest.embargo_status === "cleared"
          ? "Teacher rollout inputs are cleared for reuse."
          : params.rolloutRequest.blocked_reason ??
            "Teacher rollout inputs remain under embargo.",
    },
    ...buildRewardChecks({
      rewardArtifactIds: params.rewardArtifactIds,
      promotionEligibleFlow: params.promotionEligibleFlow,
      env: params.env,
    }),
  ];

  return finalizeJob({
    jobType: "teacher_rollout",
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: params.rolloutRequest.input_artifact_refs,
    governanceChecks: checks,
    inputSummary: `Prepare teacher rollout for ${params.rolloutRequest.teacher_runtime} on ${params.rolloutRequest.task_family_id}.`,
    rewardArtifactIds: params.rewardArtifactIds,
  });
}

export function planVerifierRefreshJob(params: {
  nicheProgramId: string;
  createdAt: string;
  verifierPackRef: ArtifactRef;
  evaluationInputRefs: ArtifactRef[];
  rewardArtifactIds?: string[];
  promotionEligibleFlow: boolean;
  env?: NodeJS.ProcessEnv;
}): OptimizerJob {
  const checks = buildRewardChecks({
    rewardArtifactIds: params.rewardArtifactIds,
    promotionEligibleFlow: params.promotionEligibleFlow,
    env: params.env,
  });
  return finalizeJob({
    jobType: "verifier_refresh",
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: [params.verifierPackRef, ...params.evaluationInputRefs],
    governanceChecks: checks,
    inputSummary: `Refresh verifier pack ${params.verifierPackRef.artifact_id} against ${params.evaluationInputRefs.length} evaluation inputs.`,
    rewardArtifactIds: params.rewardArtifactIds,
  });
}

export function planEvaluationPreparationJob(params: {
  nicheProgramId: string;
  createdAt: string;
  candidateArtifactRefs: ArtifactRef[];
  benchmarkInputRefs: ArtifactRef[];
  rewardArtifactIds?: string[];
  promotionEligibleFlow: boolean;
  env?: NodeJS.ProcessEnv;
}): OptimizerJob {
  const checks = buildRewardChecks({
    rewardArtifactIds: params.rewardArtifactIds,
    promotionEligibleFlow: params.promotionEligibleFlow,
    env: params.env,
  });
  return finalizeJob({
    jobType: "evaluation_preparation",
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: [...params.candidateArtifactRefs, ...params.benchmarkInputRefs],
    governanceChecks: checks,
    inputSummary: `Prepare evaluation inputs for ${params.candidateArtifactRefs.length} candidate artifacts.`,
    rewardArtifactIds: params.rewardArtifactIds,
  });
}
