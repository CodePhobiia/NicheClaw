import type { CandidateManifest, CandidateRelease } from "../schema/index.js";
import { getArtifactRecordsByIds, collectDescendantArtifactIds } from "../store/index.js";

export type RightsRevocationImpact = {
  revoked_source_ids: string[];
  revoked_artifact_ids: string[];
  impacted_artifact_ids: string[];
  impacted_candidate_recipe_ids: string[];
  impacted_candidate_manifest_ids: string[];
  impacted_candidate_release_ids: string[];
  impacted_promoted_release_ids: string[];
  reasons: string[];
};

function impactedManifest(manifest: CandidateManifest, impactedArtifactIds: Set<string>): boolean {
  return [
    manifest.domain_pack_id,
    manifest.action_policy_id,
    manifest.retrieval_stack_id,
    manifest.verifier_pack_id,
    manifest.candidate_recipe,
    ...manifest.optional_student_model_ids,
  ].some((artifactId) => impactedArtifactIds.has(artifactId));
}

function impactedRelease(
  release: CandidateRelease,
  impactedArtifactIds: Set<string>,
  impactedManifestIds: Set<string>,
): boolean {
  return (
    impactedManifestIds.has(release.stack_manifest.candidate_manifest_id) ||
    release.stack_manifest.component_artifact_refs.some((artifactRef) =>
      impactedArtifactIds.has(artifactRef.artifact_id),
    )
  );
}

export function traceRightsRevocationImpact(params: {
  revokedSourceIds?: string[];
  revokedArtifactIds?: string[];
  candidateManifests?: CandidateManifest[];
  candidateReleases?: CandidateRelease[];
  env?: NodeJS.ProcessEnv;
}): RightsRevocationImpact {
  const revokedSourceIds = [...new Set(params.revokedSourceIds ?? [])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const revokedArtifactIds = [...new Set(params.revokedArtifactIds ?? [])].toSorted((left, right) =>
    left.localeCompare(right),
  );
  const rootIds = [...new Set([...revokedSourceIds, ...revokedArtifactIds])];
  const descendantIds = collectDescendantArtifactIds(rootIds, params.env);
  const impactedArtifactIds = new Set([
    ...revokedArtifactIds,
    ...getArtifactRecordsByIds(descendantIds, params.env).map((record) => record.ref.artifact_id),
  ]);

  const impactedCandidateRecipeIds = getArtifactRecordsByIds([...impactedArtifactIds], params.env)
    .filter((record) => record.ref.artifact_type === "candidate_recipe")
    .map((record) => record.ref.artifact_id)
    .toSorted((left, right) => left.localeCompare(right));

  const candidateManifests = params.candidateManifests ?? [];
  const impactedCandidateManifestIds = candidateManifests
    .filter((manifest) => impactedManifest(manifest, impactedArtifactIds))
    .map((manifest) => manifest.candidate_manifest_id)
    .toSorted((left, right) => left.localeCompare(right));
  const impactedManifestIds = new Set(impactedCandidateManifestIds);

  const candidateReleases = params.candidateReleases ?? [];
  const impactedCandidateReleases = candidateReleases.filter((release) =>
    impactedRelease(release, impactedArtifactIds, impactedManifestIds),
  );
  const impactedCandidateReleaseIds = impactedCandidateReleases
    .map((release) => release.candidate_release_id)
    .toSorted((left, right) => left.localeCompare(right));
  const impactedPromotedReleaseIds = impactedCandidateReleases
    .filter((release) => release.decision === "promoted")
    .map((release) => release.candidate_release_id)
    .toSorted((left, right) => left.localeCompare(right));

  const reasons = [
    ...revokedSourceIds.map(
      (sourceId) => `Revoked source ${sourceId} is present in the artifact lineage graph.`,
    ),
    ...revokedArtifactIds.map(
      (artifactId) => `Revoked artifact ${artifactId} is present in the artifact lineage graph.`,
    ),
  ];

  return {
    revoked_source_ids: revokedSourceIds,
    revoked_artifact_ids: revokedArtifactIds,
    impacted_artifact_ids: [...impactedArtifactIds].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    impacted_candidate_recipe_ids: impactedCandidateRecipeIds,
    impacted_candidate_manifest_ids: impactedCandidateManifestIds,
    impacted_candidate_release_ids: impactedCandidateReleaseIds,
    impacted_promoted_release_ids: impactedPromotedReleaseIds,
    reasons,
  };
}
