import { propagateDerivedRights } from "../domain/rights-propagation.js";
import type { Artifact, ArtifactRef, ArtifactRightsState, LineageRef } from "../schema/index.js";
import { createArtifactRecord, writeLineageEdges } from "../store/index.js";

export type OptimizerLineageParent = {
  artifact_ref: ArtifactRef;
  relationship: string;
  derivation_step: string;
  notes: string;
};

export type MaterializedOptimizerArtifact = {
  artifact_path: string;
  lineage_path: string;
  ref: ArtifactRef;
  rights_state: ArtifactRightsState;
  lineage_refs: LineageRef[];
};

function buildLineageRefs(parents: OptimizerLineageParent[]): LineageRef[] {
  return [...parents]
    .toSorted((left, right) =>
      left.artifact_ref.artifact_id.localeCompare(right.artifact_ref.artifact_id),
    )
    .map((parent) => ({
      parent_artifact_id: parent.artifact_ref.artifact_id,
      relationship: parent.relationship,
      derivation_step: parent.derivation_step,
      notes: parent.notes,
    }));
}

export function materializeOptimizerArtifact(params: {
  artifact: Artifact;
  parents: OptimizerLineageParent[];
  explicitRightsState?: ArtifactRightsState;
  env?: NodeJS.ProcessEnv;
}): MaterializedOptimizerArtifact {
  if (params.parents.length === 0) {
    throw new Error("Optimizer artifacts require lineage parents.");
  }

  const lineageRefs = buildLineageRefs(params.parents);
  const rightsState =
    params.explicitRightsState ??
    propagateDerivedRights(params.parents.map((parent) => parent.artifact_ref.rights_state))
      .rightsState;
  const artifactRecord = createArtifactRecord({
    artifact: {
      ...params.artifact,
      lineage: lineageRefs,
    },
    rightsState,
    env: params.env,
  });
  const lineagePath = writeLineageEdges(
    params.artifact.artifact_id,
    lineageRefs,
    params.env,
  );

  return {
    artifact_path: artifactRecord.path,
    lineage_path: lineagePath,
    ref: artifactRecord.ref,
    rights_state: rightsState,
    lineage_refs: lineageRefs,
  };
}
