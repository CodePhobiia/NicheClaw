import type {
  ArtifactType,
  ArtifactRightsState,
  ManifestProviderMetadataQuality,
  SpecializationLane,
} from "../schema/index.js";

export type ProviderTuningCapability = {
  capability_id: string;
  provider: string;
  model_family: string;
  native_tuning_available: boolean;
  supported_artifact_types: ArtifactType[];
  metadata_quality: ManifestProviderMetadataQuality;
  required_credentials: string[];
  supported_lanes: SpecializationLane[];
  notes?: string;
};

export function createProviderTuningCapability(params: {
  capabilityId: string;
  provider: string;
  modelFamily: string;
  nativeTuningAvailable: boolean;
  supportedArtifactTypes: ArtifactType[];
  metadataQuality: ManifestProviderMetadataQuality;
  requiredCredentials?: string[];
  notes?: string;
}): ProviderTuningCapability {
  return {
    capability_id: params.capabilityId,
    provider: params.provider,
    model_family: params.modelFamily,
    native_tuning_available: params.nativeTuningAvailable,
    supported_artifact_types: [...params.supportedArtifactTypes].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    metadata_quality: params.metadataQuality,
    required_credentials: [...(params.requiredCredentials ?? [])].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    supported_lanes: params.nativeTuningAvailable
      ? ["provider_native_customization", "distillation", "system_specialization"]
      : ["distillation", "system_specialization"],
    notes: params.notes,
  };
}

export function canPlanProviderNativeTuning(params: {
  capability: ProviderTuningCapability;
  rightsState: ArtifactRightsState;
  availableArtifactTypes: ArtifactType[];
}): boolean {
  return (
    params.capability.native_tuning_available &&
    params.rightsState.rights_to_train &&
    params.availableArtifactTypes.some((artifactType) =>
      params.capability.supported_artifact_types.includes(artifactType),
    )
  );
}
