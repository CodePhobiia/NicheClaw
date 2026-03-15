import { describe, expect, it } from "vitest";
import {
  AnthropicNativeTuningAdapter,
  GoogleNativeTuningAdapter,
  OpenAiNativeTuningAdapter,
  buildProviderNativeTuningJobPlan,
  getDefaultTuningAdapters,
} from "../../../src/niche/optimizer/tuning-adapters.js";
import {
  createAnthropicTuningCapability,
  createGoogleTuningCapability,
  createOpenAiTuningCapability,
  createProviderTuningCapability,
} from "../../../src/niche/optimizer/tuning-capabilities.js";
import type { ArtifactRef } from "../../../src/niche/schema/index.js";

function makeRef(id: string): ArtifactRef {
  return {
    artifact_id: id,
    artifact_type: "dataset",
    version: "v1",
    content_hash: "a".repeat(64),
    rights_state: {
      rights_to_store: true,
      rights_to_train: true,
      rights_to_benchmark: true,
      rights_to_derive: true,
      rights_to_distill: true,
      rights_to_generate_synthetic_from: true,
    },
    created_at: "2026-03-14T10:00:00.000Z",
  };
}

describe("FC-03: Anthropic and Google tuning adapters", () => {
  it("getDefaultTuningAdapters returns 3 adapters sorted alphabetically", () => {
    const adapters = getDefaultTuningAdapters();
    expect(adapters).toHaveLength(3);
    expect(adapters[0]!.provider).toBe("anthropic");
    expect(adapters[1]!.provider).toBe("google");
    expect(adapters[2]!.provider).toBe("openai");
  });

  it("AnthropicNativeTuningAdapter supports anthropic capabilities and rejects openai ones", () => {
    const adapter = new AnthropicNativeTuningAdapter();
    const anthropicCapability = createAnthropicTuningCapability();
    const openaiCapability = createOpenAiTuningCapability();

    expect(adapter.supports(anthropicCapability)).toBe(true);
    expect(adapter.supports(openaiCapability)).toBe(false);
  });

  it("GoogleNativeTuningAdapter supports google capabilities and rejects openai ones", () => {
    const adapter = new GoogleNativeTuningAdapter();
    const googleCapability = createGoogleTuningCapability();
    const openaiCapability = createOpenAiTuningCapability();

    expect(adapter.supports(googleCapability)).toBe(true);
    expect(adapter.supports(openaiCapability)).toBe(false);
  });

  it("buildProviderNativeTuningJobPlan succeeds for all three providers", () => {
    const candidateRef = makeRef("candidate-recipe-1");
    const trainingRefs = [makeRef("training-dataset-1")];

    for (const factory of [
      createAnthropicTuningCapability,
      createGoogleTuningCapability,
      createOpenAiTuningCapability,
    ]) {
      const capability = factory();
      const plan = buildProviderNativeTuningJobPlan({
        capability,
        candidateRecipeRef: candidateRef,
        trainingArtifactRefs: trainingRefs,
      });
      expect(plan.provider).toBe(capability.provider);
      expect(plan.model_family).toBe(capability.model_family);
      expect(plan.required_credentials.length).toBeGreaterThan(0);
    }
  });

  it("factory presets produce valid capabilities", () => {
    const anthropicCap = createAnthropicTuningCapability();
    expect(anthropicCap.provider).toBe("anthropic");
    expect(anthropicCap.native_tuning_available).toBe(true);
    expect(anthropicCap.capability_id).toBe("anthropic-claude-finetune");
    expect(anthropicCap.model_family).toBe("claude-sonnet");
    expect(anthropicCap.supported_lanes).toContain("provider_native_customization");

    const googleCap = createGoogleTuningCapability();
    expect(googleCap.provider).toBe("google");
    expect(googleCap.native_tuning_available).toBe(true);
    expect(googleCap.capability_id).toBe("google-gemini-finetune");
    expect(googleCap.model_family).toBe("gemini-2.0");
    expect(googleCap.supported_lanes).toContain("provider_native_customization");
  });
});
