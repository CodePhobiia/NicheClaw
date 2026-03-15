import type { ArtifactRef, CandidateRecipe } from "../schema/index.js";
import {
  getArtifactRecord,
  getParentsForArtifact,
  requiresTeacherRolloutAuthority,
} from "../store/index.js";
import type { TeacherRolloutRequest } from "./data-synthesis.js";
import {
  buildOptimizerJobId,
  type OptimizerGovernanceCheck,
  type OptimizerJob,
} from "./job-model.js";
import { getRewardCalibrationMetadata } from "./reward-registry.js";

function resolveStatus(checks: OptimizerGovernanceCheck[]): OptimizerJob["status"] {
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

function resolveAuthoritativeArtifactRefs(params: {
  refs: ArtifactRef[];
  env?: NodeJS.ProcessEnv;
}): { refs: ArtifactRef[]; issues: string[] } {
  const refs: ArtifactRef[] = [];
  const issues: string[] = [];
  for (const ref of params.refs) {
    const stored = getArtifactRecord(ref, params.env);
    if (!stored) {
      issues.push(`Artifact ${ref.artifact_id} is not present in the store.`);
      continue;
    }
    if (getParentsForArtifact(stored.ref.artifact_id, params.env).length === 0) {
      issues.push(`Artifact ${stored.ref.artifact_id} has no authoritative lineage.`);
      continue;
    }
    refs.push(stored.ref);
  }
  return { refs, issues };
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
  const resolvedRecipeRefs = resolveAuthoritativeArtifactRefs({
    refs: [params.candidateRecipeRef],
    env: params.env,
  });
  const resolvedDatasetRefs = resolveAuthoritativeArtifactRefs({
    refs: params.candidateRecipe.input_dataset_refs,
    env: params.env,
  });
  const checks: OptimizerGovernanceCheck[] = [
    {
      check_id: "candidate-recipe-store-binding",
      passed: resolvedRecipeRefs.issues.length === 0 && resolvedDatasetRefs.issues.length === 0,
      blocking: true,
      message:
        resolvedRecipeRefs.issues[0] ??
        resolvedDatasetRefs.issues[0] ??
        "Candidate recipe inputs are rehydrated from the store.",
    },
    {
      check_id: "candidate-recipe-train-rights",
      passed:
        resolvedDatasetRefs.issues.length === 0 &&
        resolvedDatasetRefs.refs.every((ref) => ref.rights_state.rights_to_train),
      blocking: true,
      message:
        resolvedDatasetRefs.issues[0] ??
        (resolvedDatasetRefs.refs.every((ref) => ref.rights_state.rights_to_train)
          ? "All candidate recipe datasets retain rights_to_train."
          : "Candidate generation requires datasets with rights_to_train."),
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
    artifactRefs:
      resolvedRecipeRefs.refs.length > 0 ? resolvedRecipeRefs.refs : [params.candidateRecipeRef],
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
  const resolvedInputRefs = resolveAuthoritativeArtifactRefs({
    refs: params.rolloutRequest.input_artifact_refs,
    env: params.env,
  });
  // Check that each store-backed artifact has teacher rollout authority
  const authorityIssues: string[] = [];
  for (const ref of resolvedInputRefs.refs) {
    const stored = getArtifactRecord(ref, params.env);
    if (stored && requiresTeacherRolloutAuthority(stored.artifact.artifact_type)) {
      const authority = stored.artifact.teacher_rollout_authority;
      if (!authority) {
        authorityIssues.push(
          `Artifact ${ref.artifact_id} is missing teacher rollout authority metadata.`,
        );
      } else if (authority.embargo_status === "blocked") {
        authorityIssues.push(
          `Artifact ${ref.artifact_id} teacher rollout authority is blocked: ${authority.blocked_reason ?? "unknown reason"}.`,
        );
      }
    }
  }

  const checks: OptimizerGovernanceCheck[] = [
    {
      check_id: "teacher-rollout-store-binding",
      passed: resolvedInputRefs.issues.length === 0,
      blocking: true,
      message:
        resolvedInputRefs.issues[0] ?? "Teacher rollout inputs are rehydrated from the store.",
    },
    {
      check_id: "teacher-rollout-authority",
      passed: authorityIssues.length === 0,
      blocking: true,
      message: authorityIssues[0] ?? "All teacher rollout inputs have valid rollout authority.",
    },
    {
      check_id: "teacher-rollout-embargo",
      passed: params.rolloutRequest.embargo_status === "cleared",
      blocking: true,
      message:
        params.rolloutRequest.embargo_status === "cleared"
          ? "Teacher rollout inputs are cleared for reuse."
          : "Teacher rollout inputs remain under embargo.",
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
    artifactRefs:
      resolvedInputRefs.refs.length > 0
        ? resolvedInputRefs.refs
        : params.rolloutRequest.input_artifact_refs,
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
  const resolvedVerifierPackRef = resolveAuthoritativeArtifactRefs({
    refs: [params.verifierPackRef],
    env: params.env,
  });
  const resolvedEvaluationInputRefs = resolveAuthoritativeArtifactRefs({
    refs: params.evaluationInputRefs,
    env: params.env,
  });
  const checks = buildRewardChecks({
    rewardArtifactIds: params.rewardArtifactIds,
    promotionEligibleFlow: params.promotionEligibleFlow,
    env: params.env,
  });
  checks.unshift({
    check_id: "verifier-refresh-store-binding",
    passed:
      resolvedVerifierPackRef.issues.length === 0 &&
      resolvedEvaluationInputRefs.issues.length === 0,
    blocking: true,
    message:
      resolvedVerifierPackRef.issues[0] ??
      resolvedEvaluationInputRefs.issues[0] ??
      "Verifier refresh inputs are rehydrated from the store.",
  });
  return finalizeJob({
    jobType: "verifier_refresh",
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: [
      ...(resolvedVerifierPackRef.refs.length > 0
        ? resolvedVerifierPackRef.refs
        : [params.verifierPackRef]),
      ...(resolvedEvaluationInputRefs.refs.length > 0
        ? resolvedEvaluationInputRefs.refs
        : params.evaluationInputRefs),
    ],
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
  const resolvedCandidateArtifactRefs = resolveAuthoritativeArtifactRefs({
    refs: params.candidateArtifactRefs,
    env: params.env,
  });
  const resolvedBenchmarkInputRefs = resolveAuthoritativeArtifactRefs({
    refs: params.benchmarkInputRefs,
    env: params.env,
  });
  const checks = buildRewardChecks({
    rewardArtifactIds: params.rewardArtifactIds,
    promotionEligibleFlow: params.promotionEligibleFlow,
    env: params.env,
  });
  checks.unshift({
    check_id: "evaluation-preparation-store-binding",
    passed:
      resolvedCandidateArtifactRefs.issues.length === 0 &&
      resolvedBenchmarkInputRefs.issues.length === 0,
    blocking: true,
    message:
      resolvedCandidateArtifactRefs.issues[0] ??
      resolvedBenchmarkInputRefs.issues[0] ??
      "Evaluation inputs are rehydrated from the store.",
  });
  return finalizeJob({
    jobType: "evaluation_preparation",
    nicheProgramId: params.nicheProgramId,
    createdAt: params.createdAt,
    artifactRefs: [
      ...(resolvedCandidateArtifactRefs.refs.length > 0
        ? resolvedCandidateArtifactRefs.refs
        : params.candidateArtifactRefs),
      ...(resolvedBenchmarkInputRefs.refs.length > 0
        ? resolvedBenchmarkInputRefs.refs
        : params.benchmarkInputRefs),
    ],
    governanceChecks: checks,
    inputSummary: `Prepare evaluation inputs for ${params.candidateArtifactRefs.length} candidate artifacts.`,
    rewardArtifactIds: params.rewardArtifactIds,
  });
}
