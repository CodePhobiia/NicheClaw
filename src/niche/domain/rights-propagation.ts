import type { ArtifactRightsState } from "../schema/index.js";

export type ExplicitRightsOverride = Partial<ArtifactRightsState> & {
  authorization_override_id: string;
};

export type DerivedRightsResult = {
  rightsState: ArtifactRightsState;
  inheritedFromLineage: boolean;
  authorizationOverrideId?: string;
};

function mergeRight(inputs: boolean[], overrideValue: boolean | undefined): boolean {
  if (typeof overrideValue === "boolean") {
    return overrideValue;
  }
  return inputs.every(Boolean);
}

export function propagateDerivedRights(
  lineageRights: ArtifactRightsState[],
  explicitOverride?: ExplicitRightsOverride,
): DerivedRightsResult {
  if (lineageRights.length === 0) {
    throw new Error("Cannot propagate rights without at least one upstream lineage record.");
  }

  const rightsState: ArtifactRightsState = {
    rights_to_store: mergeRight(
      lineageRights.map((rights) => rights.rights_to_store),
      explicitOverride?.rights_to_store,
    ),
    rights_to_train: mergeRight(
      lineageRights.map((rights) => rights.rights_to_train),
      explicitOverride?.rights_to_train,
    ),
    rights_to_benchmark: mergeRight(
      lineageRights.map((rights) => rights.rights_to_benchmark),
      explicitOverride?.rights_to_benchmark,
    ),
    rights_to_derive: mergeRight(
      lineageRights.map((rights) => rights.rights_to_derive),
      explicitOverride?.rights_to_derive,
    ),
    rights_to_distill: mergeRight(
      lineageRights.map((rights) => rights.rights_to_distill),
      explicitOverride?.rights_to_distill,
    ),
    rights_to_generate_synthetic_from: mergeRight(
      lineageRights.map((rights) => rights.rights_to_generate_synthetic_from),
      explicitOverride?.rights_to_generate_synthetic_from,
    ),
  };

  return {
    rightsState,
    inheritedFromLineage: explicitOverride === undefined,
    authorizationOverrideId: explicitOverride?.authorization_override_id,
  };
}
