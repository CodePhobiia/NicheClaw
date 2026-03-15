import { propagateDerivedRights } from "../domain/rights-propagation.js";
import type {
  Artifact,
  ArtifactGovernedDataStatus,
  ArtifactRef,
  ArtifactRightsState,
  LineageRef,
} from "../schema/index.js";
import { createArtifactRecord, getArtifactRecord, writeLineageEdges } from "../store/index.js";

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

function deriveGovernedDataStatus(params: {
  artifactType: Artifact["artifact_type"];
  parents: OptimizerLineageParent[];
  env?: NodeJS.ProcessEnv;
}): ArtifactGovernedDataStatus | undefined {
  const parentStatuses = params.parents
    .map(
      (parent) => getArtifactRecord(parent.artifact_ref, params.env)?.artifact.governed_data_status,
    )
    .filter((status): status is ArtifactGovernedDataStatus => status !== undefined);

  if (parentStatuses.length === 0) {
    return undefined;
  }

  const zones = [...new Set(parentStatuses.map((status) => status.data_zone))];
  const quarantined = parentStatuses.some((status) => status.quarantined) || zones.length > 1;
  const summarize = (values: string[]) => [...new Set(values)].join("|");

  return {
    data_zone: zones.length === 1 ? zones[0] : "quarantined",
    retention_policy: summarize(parentStatuses.map((status) => status.retention_policy)),
    redaction_status: summarize(parentStatuses.map((status) => status.redaction_status)),
    pii_status: summarize(parentStatuses.map((status) => status.pii_status)),
    provenance_status: summarize(parentStatuses.map((status) => status.provenance_status)),
    quarantined,
    ...(quarantined
      ? {
          quarantine_reason:
            parentStatuses.find((status) => status.quarantine_reason)?.quarantine_reason ??
            (zones.length > 1 ? "mixed_parent_data_zones" : "parent_artifact_quarantined"),
        }
      : {}),
  };
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
      governed_data_status:
        params.artifact.governed_data_status ??
        deriveGovernedDataStatus({
          artifactType: params.artifact.artifact_type,
          parents: params.parents,
          env: params.env,
        }),
      lineage: lineageRefs,
    },
    rightsState,
    env: params.env,
  });
  const lineagePath = writeLineageEdges(params.artifact.artifact_id, lineageRefs, params.env);

  return {
    artifact_path: artifactRecord.path,
    lineage_path: lineagePath,
    ref: artifactRecord.ref,
    rights_state: rightsState,
    lineage_refs: lineageRefs,
  };
}
