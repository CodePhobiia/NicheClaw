import { describe, expect, it } from "vitest";
import { computeStableContentHash } from "../../../src/niche/benchmark/index.js";
import {
  buildProviderNativeTuningJobPlan,
  createProviderTuningCapability,
  selectTuningPlan,
} from "../../../src/niche/optimizer/index.js";
import type { ArtifactRef, ArtifactRightsState } from "../../../src/niche/schema/index.js";

const FULL_RIGHTS: ArtifactRightsState = {
  rights_to_store: true,
  rights_to_train: true,
  rights_to_benchmark: true,
  rights_to_derive: true,
  rights_to_distill: true,
  rights_to_generate_synthetic_from: true,
};

function makeRef(
  artifactId: string,
  artifactType: ArtifactRef["artifact_type"],
): ArtifactRef {
  return {
    artifact_id: artifactId,
    artifact_type: artifactType,
    version: "2026.3.12",
    content_hash: computeStableContentHash({ artifactId, artifactType }),
    rights_state: FULL_RIGHTS,
    created_at: "2026-03-12T13:40:00.000Z",
  };
}

describe("tuning capability adapters", () => {
  it("builds a provider-native tuning plan when capability and rights allow it", () => {
    const capability = createProviderTuningCapability({
      capabilityId: "openai-gpt5-tuning",
      provider: "openai",
      modelFamily: "gpt-5",
      nativeTuningAvailable: true,
      supportedArtifactTypes: ["dataset", "candidate_recipe"],
      metadataQuality: "release_label_only",
      requiredCredentials: ["OPENAI_API_KEY"],
      notes: "Provider-native tuning is supported for this model family.",
    });

    const nativePlan = buildProviderNativeTuningJobPlan({
      capability,
      candidateRecipeRef: makeRef("candidate-recipe-v1", "candidate_recipe"),
      trainingArtifactRefs: [makeRef("dataset-approved", "dataset")],
    });

    expect(nativePlan.provider).toBe("openai");
    expect(nativePlan.required_credentials).toEqual(["OPENAI_API_KEY"]);
    expect(nativePlan.metadata_quality).toBe("release_label_only");
  });

  it("falls back to distillation when provider-native tuning is unavailable", () => {
    const capability = createProviderTuningCapability({
      capabilityId: "anthropic-claude-tuning",
      provider: "anthropic",
      modelFamily: "claude-sonnet",
      nativeTuningAvailable: false,
      supportedArtifactTypes: ["dataset"],
      metadataQuality: "opaque_provider",
    });

    const plan = selectTuningPlan({
      capability,
      rights_state: FULL_RIGHTS,
      candidate_recipe_ref: makeRef("candidate-recipe-v1", "candidate_recipe"),
      training_artifact_refs: [makeRef("dataset-approved", "dataset")],
      distillation_available: true,
      sidecar_available: true,
      policy: {
        allow_provider_native: true,
        fallback_lane: "distillation",
      },
    });

    expect(plan.selected_lane).toBe("distillation");
    expect(plan.provider_native_plan).toBeUndefined();
  });

  it("falls back to sidecar/system specialization when distillation is unavailable", () => {
    const capability = createProviderTuningCapability({
      capabilityId: "gemini-flash-tuning",
      provider: "google",
      modelFamily: "gemini-flash",
      nativeTuningAvailable: false,
      supportedArtifactTypes: ["dataset"],
      metadataQuality: "proxy_resolved",
    });

    const plan = selectTuningPlan({
      capability,
      rights_state: FULL_RIGHTS,
      candidate_recipe_ref: makeRef("candidate-recipe-v2", "candidate_recipe"),
      training_artifact_refs: [makeRef("dataset-approved", "dataset")],
      distillation_available: false,
      sidecar_available: true,
      policy: {
        allow_provider_native: true,
        fallback_lane: "system_specialization",
      },
    });

    expect(plan.selected_lane).toBe("system_specialization");
  });

  it("refuses provider-native planning when training rights are missing", () => {
    const capability = createProviderTuningCapability({
      capabilityId: "openai-gpt5-tuning",
      provider: "openai",
      modelFamily: "gpt-5",
      nativeTuningAvailable: true,
      supportedArtifactTypes: ["dataset", "candidate_recipe"],
      metadataQuality: "release_label_only",
    });

    const plan = selectTuningPlan({
      capability,
      rights_state: {
        ...FULL_RIGHTS,
        rights_to_train: false,
      },
      candidate_recipe_ref: makeRef("candidate-recipe-v1", "candidate_recipe"),
      training_artifact_refs: [makeRef("dataset-approved", "dataset")],
      distillation_available: true,
      sidecar_available: true,
      policy: {
        allow_provider_native: true,
        fallback_lane: "distillation",
      },
    });

    expect(plan.selected_lane).toBe("distillation");
  });
});
