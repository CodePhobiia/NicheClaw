import type { ArtifactRef, ManifestProviderMetadataQuality } from "../schema/index.js";
import type { ProviderTuningCapability } from "./tuning-capabilities.js";

export type ProviderNativeTuningJobPlan = {
  adapter_id: string;
  provider: string;
  model_family: string;
  metadata_quality: ManifestProviderMetadataQuality;
  required_credentials: string[];
  training_artifact_refs: ArtifactRef[];
  candidate_recipe_ref: ArtifactRef;
  notes?: string;
};

export interface ProviderNativeTuningAdapter {
  readonly provider: string;
  supports(capability: ProviderTuningCapability): boolean;
  buildJobPlan(params: {
    capability: ProviderTuningCapability;
    candidateRecipeRef: ArtifactRef;
    trainingArtifactRefs: ArtifactRef[];
  }): ProviderNativeTuningJobPlan;
}

export class OpenAiNativeTuningAdapter implements ProviderNativeTuningAdapter {
  readonly provider = "openai";

  supports(capability: ProviderTuningCapability): boolean {
    return capability.provider === this.provider && capability.native_tuning_available;
  }

  buildJobPlan(params: {
    capability: ProviderTuningCapability;
    candidateRecipeRef: ArtifactRef;
    trainingArtifactRefs: ArtifactRef[];
  }): ProviderNativeTuningJobPlan {
    if (!this.supports(params.capability)) {
      throw new Error(
        `Capability ${params.capability.capability_id} does not support ${this.provider} native tuning.`,
      );
    }

    return {
      adapter_id: "openai-native-tuning",
      provider: this.provider,
      model_family: params.capability.model_family,
      metadata_quality: params.capability.metadata_quality,
      required_credentials: [...params.capability.required_credentials],
      training_artifact_refs: [...params.trainingArtifactRefs].toSorted((left, right) =>
        left.artifact_id.localeCompare(right.artifact_id),
      ),
      candidate_recipe_ref: params.candidateRecipeRef,
      notes:
        params.capability.notes ??
        "Provider-native tuning job plan only; execution remains out of scope.",
    };
  }
}

export function getDefaultTuningAdapters(): ProviderNativeTuningAdapter[] {
  return [new OpenAiNativeTuningAdapter()];
}

export function buildProviderNativeTuningJobPlan(params: {
  capability: ProviderTuningCapability;
  candidateRecipeRef: ArtifactRef;
  trainingArtifactRefs: ArtifactRef[];
  adapters?: ProviderNativeTuningAdapter[];
}): ProviderNativeTuningJobPlan {
  const adapter = (params.adapters ?? getDefaultTuningAdapters()).find((candidate) =>
    candidate.supports(params.capability),
  );
  if (!adapter) {
    throw new Error(
      `No provider-native tuning adapter is available for provider ${params.capability.provider}.`,
    );
  }
  return adapter.buildJobPlan({
    capability: params.capability,
    candidateRecipeRef: params.candidateRecipeRef,
    trainingArtifactRefs: params.trainingArtifactRefs,
  });
}
