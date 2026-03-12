import type {
  ArtifactRef,
  ArtifactRightsState,
  ManifestProviderMetadataQuality,
  SpecializationLane,
} from "../schema/index.js";
import {
  buildProviderNativeTuningJobPlan,
  type ProviderNativeTuningJobPlan,
} from "./tuning-adapters.js";
import {
  canPlanProviderNativeTuning,
  type ProviderTuningCapability,
} from "./tuning-capabilities.js";

export type TuningPlannerPolicy = {
  allow_provider_native: boolean;
  fallback_lane: Extract<SpecializationLane, "distillation" | "system_specialization">;
  require_metadata_quality_at_least?: ManifestProviderMetadataQuality;
};

export type TuningPlannerInput = {
  capability: ProviderTuningCapability;
  rights_state: ArtifactRightsState;
  candidate_recipe_ref: ArtifactRef;
  training_artifact_refs: ArtifactRef[];
  distillation_available: boolean;
  sidecar_available: boolean;
  policy: TuningPlannerPolicy;
};

export type TuningPlan = {
  selected_lane: SpecializationLane;
  reason: string;
  provider_native_plan?: ProviderNativeTuningJobPlan;
};

function metadataQualityRank(value: ManifestProviderMetadataQuality): number {
  switch (value) {
    case "exact_snapshot":
      return 4;
    case "release_label_only":
      return 3;
    case "proxy_resolved":
      return 2;
    case "opaque_provider":
      return 1;
  }
}

function metadataQualitySatisfies(
  actual: ManifestProviderMetadataQuality,
  minimum: ManifestProviderMetadataQuality | undefined,
): boolean {
  if (!minimum) {
    return true;
  }
  return metadataQualityRank(actual) >= metadataQualityRank(minimum);
}

export function selectTuningPlan(input: TuningPlannerInput): TuningPlan {
  const availableArtifactTypes = input.training_artifact_refs.map(
    (ref) => ref.artifact_type,
  );
  const providerNativeAllowed =
    input.policy.allow_provider_native &&
    metadataQualitySatisfies(
      input.capability.metadata_quality,
      input.policy.require_metadata_quality_at_least,
    ) &&
    canPlanProviderNativeTuning({
      capability: input.capability,
      rightsState: input.rights_state,
      availableArtifactTypes,
    });

  if (providerNativeAllowed) {
    return {
      selected_lane: "provider_native_customization",
      reason: `Provider ${input.capability.provider} exposes a truthful native tuning lane for ${input.capability.model_family}.`,
      provider_native_plan: buildProviderNativeTuningJobPlan({
        capability: input.capability,
        candidateRecipeRef: input.candidate_recipe_ref,
        trainingArtifactRefs: input.training_artifact_refs,
      }),
    };
  }

  if (input.distillation_available && input.rights_state.rights_to_distill) {
    return {
      selected_lane: "distillation",
      reason:
        input.capability.native_tuning_available
          ? "Provider-native tuning is disallowed by policy or metadata quality, so distillation is selected."
          : "Provider-native tuning is unavailable, so distillation is selected.",
    };
  }

  if (input.sidecar_available && input.rights_state.rights_to_derive) {
    return {
      selected_lane: "system_specialization",
      reason:
        input.policy.fallback_lane === "system_specialization"
          ? "Falling back to sidecar/system specialization because provider-native tuning is unavailable or unsupported."
          : "Distillation is unavailable, so sidecar/system specialization is selected.",
    };
  }

  throw new Error(
    "No valid specialization lane is available for the current capability, rights state, and operator policy.",
  );
}
