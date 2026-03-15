---
summary: "NicheClaw supports four specialization lanes -- distinct approaches to customizing agent behavior -- that can be combined in a single Niche Program."
read_when:
  - You want to understand the four ways NicheClaw can specialize an agent
  - You are choosing which specialization lanes to enable in your Niche Program
  - You need to know the tradeoffs between different customization approaches
title: "Specialization Lanes"
---

# Specialization Lanes

A specialization lane is a distinct approach to customizing agent behavior for a niche domain. NicheClaw supports four lanes, and a [Niche Program](/niche/concepts/niche-program) must select at least one. Lanes can be combined -- the optimizer and runtime will use all selected lanes when generating candidates and executing tasks.

## The four lanes

### system_specialization

Customizes the agent's system prompt, planning context, and instruction set based on the compiled [Domain Pack](/niche/concepts/domain-pack). This lane injects domain ontology, terminology, constraints, and task taxonomy into the planner's context window at runtime.

**What changes:** The system prompt and planning instructions the model receives. The model weights and API configuration remain unchanged.

**Strengths:** No model training required. Fast iteration. Changes are fully transparent and auditable. Works with any provider API that supports system prompts.

**Limitations:** Bounded by context window size. Cannot change the model's learned behaviors or capabilities. Effectiveness depends on the model's ability to follow long, structured instructions.

### distillation

Trains a smaller or more efficient student model using outputs from a teacher model (the planner runtime) on domain-specific tasks. The optimizer generates synthetic training data from the Domain Pack and approved sources, then uses it to produce a distilled model artifact.

**What changes:** A student model is trained or fine-tuned on domain-specific data. The student model may replace or augment the planner runtime for specific task families.

**Strengths:** Can produce faster and cheaper inference for well-scoped task families. Captures implicit domain knowledge in model weights. Can improve consistency on repetitive tasks.

**Limitations:** Requires `rights_to_train` and `rights_to_distill` on all input data. Training data must pass contamination checks against the held-out benchmark suite. Student models must be re-benchmarked against the same-model baseline. Adds complexity to the release pipeline.

### provider_native_customization

Uses the model provider's built-in customization features -- such as fine-tuning APIs, cached system prompts, or provider-managed training pipelines. NicheClaw prepares the input data and configuration, then delegates the actual customization to the provider.

**What changes:** Provider-side model state (fine-tuned weights, cached context, or equivalent). The specific mechanism depends on the provider's API.

**Strengths:** Leverages provider infrastructure for training and serving. May access optimization features not available through standard APIs. Can produce deeper behavioral changes than prompt-only approaches.

**Limitations:** Provider-dependent. Not all providers support native customization. The operator must trust the provider's training pipeline with their domain data (subject to `rights_and_data_policy`). Reproducibility depends on provider versioning and snapshot guarantees. The `provider_metadata_quality` field in manifests tracks how precisely the provider's model state is pinned.

### prompt_policy_assets

Builds and maintains a library of reusable prompt fragments, few-shot exemplars, retrieval-augmented context templates, and policy documents that are assembled at runtime based on the task at hand. Unlike `system_specialization` which sets a static system prompt, this lane dynamically composes prompt content from versioned assets.

**What changes:** The prompt content assembled for each task invocation. Assets are versioned, and the `prompt_asset_version` field in manifests pins which asset set was used during benchmarking.

**Strengths:** Fine-grained control over per-task-family prompting. Assets can be A/B tested independently. Supports progressive enrichment as more domain knowledge is compiled. Easy to audit which assets contributed to a given output.

**Limitations:** Requires careful management of asset versions and their interaction with benchmark comparability. Context budget limits apply -- the total assembled prompt must fit within the declared `context_budget`.

## How to choose

| Situation                                                    | Recommended lanes                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Quick start, no training infrastructure                      | `system_specialization`, `prompt_policy_assets`                                  |
| Well-scoped domain with repetitive tasks and training rights | `system_specialization`, `distillation`, `prompt_policy_assets`                  |
| Provider offers fine-tuning API and you want maximum depth   | `system_specialization`, `provider_native_customization`, `prompt_policy_assets` |
| Maximum specialization with all available levers             | All four lanes                                                                   |

Most programs should include `system_specialization` as a baseline -- it is the lowest-friction lane and provides immediate benefit from the compiled Domain Pack. Add `prompt_policy_assets` when you want dynamic, per-task-family prompt composition. Add `distillation` or `provider_native_customization` when the domain warrants deeper model-level changes and the data rights support it.

## Selecting lanes in the Niche Program

Lanes are declared in the `runtime_stack.specialization_lanes` array. At least one lane must be selected. Example:

```json
{
  "runtime_stack": {
    "planner_runtime": { ... },
    "specialization_lanes": [
      "system_specialization",
      "distillation",
      "prompt_policy_assets"
    ]
  }
}
```

The selected lanes affect:

- **Compilation:** Which Domain Pack fields are prioritized during source ingestion.
- **Optimization:** Which candidate recipe types the optimizer can produce (e.g., distillation recipes are only generated when `distillation` is selected).
- **Benchmarking:** Which stack components differ between baseline and candidate.
- **Release:** Which artifacts are included in the candidate stack manifest.
