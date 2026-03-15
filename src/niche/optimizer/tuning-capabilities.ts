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

export function createOpenAiTuningCapability(
  overrides?: Partial<Omit<ProviderTuningCapability, "provider">>,
): ProviderTuningCapability {
  return createProviderTuningCapability({
    capabilityId: overrides?.capability_id ?? "openai-gpt4o-finetune",
    provider: "openai",
    modelFamily: overrides?.model_family ?? "gpt-4o",
    nativeTuningAvailable: overrides?.native_tuning_available ?? true,
    supportedArtifactTypes: (overrides?.supported_artifact_types as ArtifactType[]) ?? [
      "dataset",
      "prompt_asset",
    ],
    metadataQuality: overrides?.metadata_quality ?? "release_label_only",
    requiredCredentials: overrides?.required_credentials ?? ["OPENAI_API_KEY"],
    notes: overrides?.notes ?? "OpenAI fine-tuning via the fine-tuning API.",
  });
}

export function createAnthropicTuningCapability(
  overrides?: Partial<Omit<ProviderTuningCapability, "provider">>,
): ProviderTuningCapability {
  return createProviderTuningCapability({
    capabilityId: overrides?.capability_id ?? "anthropic-claude-finetune",
    provider: "anthropic",
    modelFamily: overrides?.model_family ?? "claude-sonnet",
    nativeTuningAvailable: overrides?.native_tuning_available ?? true,
    supportedArtifactTypes: (overrides?.supported_artifact_types as ArtifactType[]) ?? [
      "dataset",
      "prompt_asset",
    ],
    metadataQuality: overrides?.metadata_quality ?? "release_label_only",
    requiredCredentials: overrides?.required_credentials ?? ["ANTHROPIC_API_KEY"],
    notes: overrides?.notes ?? "Anthropic fine-tuning via the fine-tuning API.",
  });
}

export function createGoogleTuningCapability(
  overrides?: Partial<Omit<ProviderTuningCapability, "provider">>,
): ProviderTuningCapability {
  return createProviderTuningCapability({
    capabilityId: overrides?.capability_id ?? "google-gemini-finetune",
    provider: "google",
    modelFamily: overrides?.model_family ?? "gemini-2.0",
    nativeTuningAvailable: overrides?.native_tuning_available ?? true,
    supportedArtifactTypes: (overrides?.supported_artifact_types as ArtifactType[]) ?? [
      "dataset",
      "prompt_asset",
    ],
    metadataQuality: overrides?.metadata_quality ?? "release_label_only",
    requiredCredentials: overrides?.required_credentials ?? ["GOOGLE_API_KEY"],
    notes: overrides?.notes ?? "Google fine-tuning via the Gemini tuning API.",
  });
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
