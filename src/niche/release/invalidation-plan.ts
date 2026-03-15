import type { CandidateRelease, Artifact } from "../schema/index.js";
import { getArtifactRecordsByIds } from "../store/index.js";
import type { RightsRevocationImpact } from "./rights-revocation.js";

export type InvalidationTargetType =
  | "artifact"
  | "candidate_manifest"
  | "candidate_release"
  | "promoted_release";

export type InvalidationActionType = "quarantine" | "rebuild" | "rollback" | "delete";

export type InvalidationPlanAction = {
  target_type: InvalidationTargetType;
  target_id: string;
  action: InvalidationActionType;
  reason: string;
};

export type InvalidationPlan = {
  plan_id: string;
  generated_at: string;
  actions: InvalidationPlanAction[];
  summary: {
    quarantine_count: number;
    rebuild_count: number;
    rollback_count: number;
    delete_count: number;
  };
};

function needsRebuild(artifactType: Artifact["artifact_type"]): boolean {
  return [
    "dataset",
    "candidate_recipe",
    "retrieval_stack",
    "verifier_pack",
    "action_policy",
    "student_model",
    "release_bundle",
    "domain_pack",
  ].includes(artifactType);
}

export function buildInvalidationPlan(params: {
  impact: RightsRevocationImpact;
  generatedAt: string;
  candidateReleases?: CandidateRelease[];
  env?: NodeJS.ProcessEnv;
}): InvalidationPlan {
  const actions: InvalidationPlanAction[] = [];
  const impactedRecords = getArtifactRecordsByIds(params.impact.impacted_artifact_ids, params.env);

  for (const record of impactedRecords) {
    actions.push({
      target_type: "artifact",
      target_id: record.ref.artifact_id,
      action: "quarantine",
      reason: "Artifact descends from revoked lineage and must be quarantined immediately.",
    });
    if (needsRebuild(record.ref.artifact_type)) {
      actions.push({
        target_type: "artifact",
        target_id: record.ref.artifact_id,
        action: "rebuild",
        reason:
          "Artifact is derived from revoked lineage and must be rebuilt from approved inputs.",
      });
    }
    if (params.impact.revoked_artifact_ids.includes(record.ref.artifact_id)) {
      actions.push({
        target_type: "artifact",
        target_id: record.ref.artifact_id,
        action: "delete",
        reason: "Revoked root artifact should be purged from the active registry path.",
      });
    }
  }

  for (const manifestId of params.impact.impacted_candidate_manifest_ids) {
    actions.push({
      target_type: "candidate_manifest",
      target_id: manifestId,
      action: "quarantine",
      reason: "Candidate manifest references artifacts from revoked lineage.",
    });
  }

  const releaseById = new Map(
    (params.candidateReleases ?? []).map((release) => [release.candidate_release_id, release]),
  );
  for (const releaseId of params.impact.impacted_candidate_release_ids) {
    actions.push({
      target_type: "candidate_release",
      target_id: releaseId,
      action: "quarantine",
      reason: "Candidate release includes artifacts or manifests from revoked lineage.",
    });
    const release = releaseById.get(releaseId);
    if (release && params.impact.impacted_promoted_release_ids.includes(releaseId)) {
      actions.push({
        target_type: "promoted_release",
        target_id: releaseId,
        action: "rollback",
        reason: `Promoted release must roll back to ${release.rollback_target} because its lineage was revoked.`,
      });
    }
  }

  const summary = {
    quarantine_count: actions.filter((action) => action.action === "quarantine").length,
    rebuild_count: actions.filter((action) => action.action === "rebuild").length,
    rollback_count: actions.filter((action) => action.action === "rollback").length,
    delete_count: actions.filter((action) => action.action === "delete").length,
  };

  return {
    plan_id: `invalidation-plan-${params.generatedAt}`,
    generated_at: params.generatedAt,
    actions: actions.toSorted((left, right) => {
      const typeDelta = left.target_type.localeCompare(right.target_type);
      if (typeDelta !== 0) {
        return typeDelta;
      }
      return left.target_id.localeCompare(right.target_id);
    }),
    summary,
  };
}
