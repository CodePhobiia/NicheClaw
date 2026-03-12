import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";
import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  ArtifactRefSchema,
  CandidateRecipeSchema,
  type ArtifactRef,
  type CandidateRecipe,
} from "../../niche/schema/index.js";
import {
  OPTIMIZER_JOB_TYPES,
  planCandidateGenerationJob,
  planEvaluationPreparationJob,
  planTeacherRolloutJob,
  planVerifierRefreshJob,
  type OptimizerJob,
  type OptimizerJobType,
  type TeacherRolloutRequest,
} from "../../niche/optimizer/index.js";

export type NicheOptimizeOptions = {
  jobType: string;
  nicheProgramId: string;
  createdAt?: string;
  rewardArtifactIds?: string[];
  promotionEligible?: boolean;
  candidateRecipePath?: string;
  candidateRecipeRefPath?: string;
  teacherRolloutRequestPath?: string;
  verifierPackRefPath?: string;
  evaluationInputRefPaths?: string[];
  candidateArtifactRefPaths?: string[];
  benchmarkInputRefPaths?: string[];
  json?: boolean;
};

export type NicheOptimizeResult = {
  preview: true;
  job: OptimizerJob;
};

function validateValue<T>(
  schema: Record<string, unknown>,
  cacheKey: string,
  value: T,
  label: string,
): T {
  const validation = validateJsonSchemaValue({
    schema,
    cacheKey,
    value,
  });
  if (validation.ok) {
    return value;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function loadArtifactRef(pathname: string): ArtifactRef {
  return validateValue(
    ArtifactRefSchema,
    `niche-cli-optimize-artifact-ref-${pathname}`,
    readRequiredJsonFileStrict(pathname) as ArtifactRef,
    `artifact ref ${pathname}`,
  );
}

function loadArtifactRefs(pathnames: string[] | undefined, label: string): ArtifactRef[] {
  const resolved = pathnames ?? [];
  if (resolved.length === 0) {
    throw new Error(`At least one ${label} is required.`);
  }
  return resolved.map((pathname) => loadArtifactRef(pathname));
}

function loadCandidateRecipe(pathname: string): CandidateRecipe {
  return validateValue(
    CandidateRecipeSchema,
    `niche-cli-optimize-candidate-recipe-${pathname}`,
    readRequiredJsonFileStrict(pathname) as CandidateRecipe,
    `candidate recipe ${pathname}`,
  );
}

function assertTeacherRolloutRequest(value: unknown, label: string): TeacherRolloutRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  const candidate = value as Partial<TeacherRolloutRequest>;
  if (
    typeof candidate.rollout_request_id !== "string" ||
    typeof candidate.teacher_runtime !== "string" ||
    typeof candidate.objective !== "string" ||
    typeof candidate.task_family_id !== "string" ||
    !Array.isArray(candidate.input_artifact_refs) ||
    typeof candidate.max_examples !== "number" ||
    !candidate.rights_state ||
    (candidate.embargo_status !== "cleared" && candidate.embargo_status !== "blocked")
  ) {
    throw new Error(`Invalid ${label}: missing required teacher rollout request fields.`);
  }
  return {
    rollout_request_id: candidate.rollout_request_id,
    teacher_runtime: candidate.teacher_runtime,
    objective: candidate.objective,
    task_family_id: candidate.task_family_id,
    input_artifact_refs: candidate.input_artifact_refs.map((ref, index) =>
      validateValue(
        ArtifactRefSchema,
        `niche-cli-optimize-rollout-ref-${index}`,
        ref,
        `teacher rollout artifact ref ${index}`,
      ),
    ),
    max_examples: candidate.max_examples,
    rights_state: candidate.rights_state,
    embargo_status: candidate.embargo_status,
    blocked_reason: candidate.blocked_reason,
  };
}

function normalizeJobType(jobType: string): OptimizerJobType {
  const normalized = jobType.trim().replace(/-/g, "_");
  if (OPTIMIZER_JOB_TYPES.includes(normalized as OptimizerJobType)) {
    return normalized as OptimizerJobType;
  }
  throw new Error(
    `Unsupported optimizer job type "${jobType}". Expected one of: ${OPTIMIZER_JOB_TYPES.join(", ")}.`,
  );
}

function formatOptimizeSummary(result: NicheOptimizeResult): string {
  const lines = [
    `Optimization plan ready: ${result.job.job_id}`,
    `Job type: ${result.job.job_type}`,
    `Status: ${result.job.status}`,
    `Artifact refs: ${result.job.artifact_refs.length}`,
  ];
  if (result.job.blocked_reason) {
    lines.push(`Blocked reason: ${result.job.blocked_reason}`);
  }
  if (result.job.governance_checks.length > 0) {
    lines.push(
      `Governance: ${result.job.governance_checks
        .map((check) => `${check.check_id}=${check.passed ? "pass" : "fail"}`)
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}

export async function nicheOptimizeCommand(
  opts: NicheOptimizeOptions,
  runtime: RuntimeEnv = defaultRuntime,
  env: NodeJS.ProcessEnv = process.env,
): Promise<NicheOptimizeResult> {
  const jobType = normalizeJobType(opts.jobType);
  const createdAt = opts.createdAt?.trim() || new Date().toISOString();
  const rewardArtifactIds = opts.rewardArtifactIds ?? [];
  const promotionEligible = opts.promotionEligible === true;

  let job: OptimizerJob;
  switch (jobType) {
    case "candidate_generation": {
      if (!opts.candidateRecipePath || !opts.candidateRecipeRefPath) {
        throw new Error(
          "candidate_generation requires --candidate-recipe and --candidate-recipe-ref.",
        );
      }
      job = planCandidateGenerationJob({
        nicheProgramId: opts.nicheProgramId,
        createdAt,
        candidateRecipe: loadCandidateRecipe(opts.candidateRecipePath),
        candidateRecipeRef: loadArtifactRef(opts.candidateRecipeRefPath),
        rewardArtifactIds,
        promotionEligibleFlow: promotionEligible,
        env,
      });
      break;
    }
    case "teacher_rollout": {
      if (!opts.teacherRolloutRequestPath) {
        throw new Error("teacher_rollout requires --teacher-rollout-request.");
      }
      job = planTeacherRolloutJob({
        nicheProgramId: opts.nicheProgramId,
        createdAt,
        rolloutRequest: assertTeacherRolloutRequest(
          readRequiredJsonFileStrict(opts.teacherRolloutRequestPath),
          opts.teacherRolloutRequestPath,
        ),
        rewardArtifactIds,
        promotionEligibleFlow: promotionEligible,
        env,
      });
      break;
    }
    case "verifier_refresh": {
      if (!opts.verifierPackRefPath) {
        throw new Error("verifier_refresh requires --verifier-pack-ref.");
      }
      job = planVerifierRefreshJob({
        nicheProgramId: opts.nicheProgramId,
        createdAt,
        verifierPackRef: loadArtifactRef(opts.verifierPackRefPath),
        evaluationInputRefs: loadArtifactRefs(
          opts.evaluationInputRefPaths,
          "evaluation input ref",
        ),
        rewardArtifactIds,
        promotionEligibleFlow: promotionEligible,
        env,
      });
      break;
    }
    case "evaluation_preparation": {
      job = planEvaluationPreparationJob({
        nicheProgramId: opts.nicheProgramId,
        createdAt,
        candidateArtifactRefs: loadArtifactRefs(
          opts.candidateArtifactRefPaths,
          "candidate artifact ref",
        ),
        benchmarkInputRefs: loadArtifactRefs(
          opts.benchmarkInputRefPaths,
          "benchmark input ref",
        ),
        rewardArtifactIds,
        promotionEligibleFlow: promotionEligible,
        env,
      });
      break;
    }
  }

  const result: NicheOptimizeResult = {
    preview: true,
    job,
  };
  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatOptimizeSummary(result));
  return result;
}
