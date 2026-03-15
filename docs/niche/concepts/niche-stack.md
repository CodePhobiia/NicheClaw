---
summary: "The Niche Stack is the deployed specialization unit -- a composite of domain pack, action policy, retrieval stack, verifier pack, benchmark suite, and release policy that together form the specialization artifact."
read_when:
  - You want to understand what gets deployed when a specialization is released
  - You are comparing baseline vs candidate stacks
  - You need to know why the stack is more than just model weights
title: "Niche Stack"
---

# Niche Stack

A Niche Stack is the deployed product artifact of NicheClaw specialization. It is not a model checkpoint or a single set of weights -- it is the complete composite of components that together form a specialized agent capability for a specific domain.

The key insight behind the Niche Stack is that even when the underlying model is frozen (same-model baseline discipline), specialization can improve performance through the surrounding stack: better retrieval, tighter constraints, refined verification, and tuned action policies.

## Components

| Component         | Description                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planner_runtime` | The model runtime that executes planning and task completion. Declared in the [Niche Program](/niche/concepts/niche-program) and pinned in both baseline and candidate manifests. In same-model comparison, the planner runtime is identical between baseline and candidate. |
| `domain_pack`     | The compiled knowledge artifact containing ontology, task taxonomy, terminology, constraints, tool contracts, evidence sources, failure taxonomy, verifier defaults, and benchmark seeds. See [Domain Pack](/niche/concepts/domain-pack).                                    |
| `action_policy`   | The runtime policy that governs which actions the agent may take, tool invocation ordering, and constraint enforcement. Referenced by `action_policy_id` in the candidate manifest.                                                                                          |
| `retrieval_stack` | The retrieval configuration and index that grounds the agent in approved evidence sources. Referenced by `retrieval_stack_id` in the candidate manifest. Covers retrieval indices, live source access, and context budgets.                                                  |
| `verifier_pack`   | The verification layer that checks agent outputs against domain constraints, failure taxonomy, and output requirements. Referenced by `verifier_pack_id` in the candidate manifest.                                                                                          |
| `benchmark_suite` | The held-out evaluation suite used to measure specialization quality. Both baseline and candidate must use the same `benchmark_suite_id` for comparison to be valid.                                                                                                         |
| `release_policy`  | The governance rules that determine when a candidate stack can be promoted, what monitoring is applied post-release, and when rollback is triggered. Includes drift thresholds, shadow recheck policies, and rollback conditions.                                            |

## Why the whole stack matters

Traditional fine-tuning focuses on model weights alone. NicheClaw takes a different approach: the specialization artifact is the entire stack, not just the model. This means:

- A frozen model can still improve through better retrieval grounding, tighter tool contracts, and refined verification.
- Benchmark comparisons are valid only when the execution environment is controlled -- same model, same sampling config, same token budgets, same tool catalog.
- Release promotion evaluates the full stack delta, not just a model quality metric.
- Rollback restores the entire previous stack, not just a model checkpoint.

## How stacks are compared

NicheClaw enforces same-model baseline discipline for stack comparison. A baseline manifest and a candidate manifest must agree on a set of execution invariants for their benchmark results to be comparable:

- Same `benchmark_suite_id`
- Same `source_access_manifest_id`
- Same `provider` and `model_id` (unless explicitly running a cross-model experiment)
- Same `planner_runtime` component ID, provider, model ID, and API mode
- Same `api_mode`, `sampling_config`, `retry_policy`, `token_budget`, `context_budget`, `execution_mode`
- Same `grader_set_version`, `tool_catalog_version`, `tool_allowlist`, `tool_contract_version`
- Same `retrieval_config` and `verifier_config`

If any of these invariants differ, the manifests produce comparison issues and benchmark results cannot be used for release decisions. The specific issue codes are: `benchmark_suite_mismatch`, `provider_mismatch`, `model_id_mismatch`, `planner_runtime_mismatch`, `source_access_mismatch`, and `execution_invariant_mismatch`.

The candidate stack differs from the baseline only in the specialization-specific components: `domain_pack_id`, `action_policy_id`, `retrieval_stack_id`, `verifier_pack_id`, optional `student_model_ids`, and the `candidate_recipe` that produced them.

## Release lifecycle

1. A baseline manifest is created from the current production stack (or a fresh same-model configuration).
2. The optimizer produces a candidate stack via a candidate recipe.
3. Both stacks are benchmarked against the same suite under identical execution conditions.
4. If the candidate demonstrates statistically significant improvement, a release decision is made: `promoted`, `rejected`, `shadow`, `canary`, or `experimental`.
5. Promoted stacks enter post-release monitoring with drift thresholds. If drift exceeds thresholds, the rollback policy triggers reversion to the previous stack.
