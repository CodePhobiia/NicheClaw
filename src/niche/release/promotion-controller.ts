import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import {
  CandidateReleaseSchema,
  type ArtifactRef,
  type CandidateRelease,
  type CandidateReleaseDecision,
} from "../schema/index.js";
import type { BenchmarkResultSummary, BaselineManifest, CandidateManifest } from "../schema/index.js";
import type { ReleasePolicyEvaluation } from "./policy-engine.js";

export type PromotionControllerResult = {
  decision: CandidateReleaseDecision;
  reason: string;
  warnings: string[];
  candidate_release: CandidateRelease;
};

function assertCandidateRelease(candidateRelease: CandidateRelease): CandidateRelease {
  const validation = validateJsonSchemaValue({
    schema: CandidateReleaseSchema,
    cacheKey: "promotion-controller-candidate-release",
    value: candidateRelease,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid candidate release: ${details}`);
  }
  return candidateRelease;
}

export function createPromotionControllerResult(params: {
  candidateReleaseId: string;
  nicheProgramId: string;
  baselineReleaseId: string;
  baselineManifest: BaselineManifest;
  candidateManifest: CandidateManifest;
  componentArtifactRefs: ArtifactRef[];
  benchmarkResults: BenchmarkResultSummary[];
  shadowResults?: BenchmarkResultSummary[];
  approvedBy: string[];
  rollbackTarget: string;
  policyEvaluation: ReleasePolicyEvaluation;
}): PromotionControllerResult {
  const shadowResults = params.shadowResults ?? [];
  const decision = params.policyEvaluation.recommended_decision;
  const reason =
    params.policyEvaluation.blocking_reasons[0] ??
    params.policyEvaluation.warnings[0] ??
    `Candidate release is ready for ${decision}.`;

  return {
    decision,
    reason,
    warnings: [...params.policyEvaluation.warnings],
    candidate_release: assertCandidateRelease({
      candidate_release_id: params.candidateReleaseId,
      niche_program_id: params.nicheProgramId,
      baseline_release_id: params.baselineReleaseId,
      stack_manifest: {
        baseline_manifest_id: params.baselineManifest.baseline_manifest_id,
        candidate_manifest_id: params.candidateManifest.candidate_manifest_id,
        component_artifact_refs: params.componentArtifactRefs,
      },
      benchmark_results: params.benchmarkResults,
      shadow_results: shadowResults,
      decision,
      decision_reason: reason,
      approved_by: params.approvedBy,
      rollback_target: params.rollbackTarget,
    }),
  };
}
