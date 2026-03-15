# Optimizer Scope: MVP Pilot Decision

## Decision

The MVP pilot uses the **system specialization lane only**. Provider-native tuning and distillation lanes are structurally defined but not operational for the pilot.

## What This Means

### Available at Pilot

- Domain compilation (source ingest, ontology, constraints, tool contracts)
- Prompt/policy asset customization (planner injection, action policy, verifier pack)
- Retrieval stack specialization (source access manifest, evidence grounding)
- Benchmark execution and comparison (baseline vs candidate)
- Release governance (policy evaluation, promotion, rollback, monitoring)

### Not Available at Pilot

- Provider-native fine-tuning (OpenAI, Anthropic, Google adapters exist as plan-only)
- Distillation from frontier teacher to student models
- External tuning job execution (job-executor defers to injected callbacks)
- Credential resolution beyond environment variable validation

## Why

The system specialization lane proves the core thesis: a Niche Stack (prompt + policy + retrieval + verifier) measurably outperforms a general agent on held-out niche tasks, using the same frontier model. Provider-native tuning is an optimization path that adds value but is not required to validate the product.

The credential resolver (`src/niche/optimizer/credential-resolver.ts`) validates environment variable presence but does not resolve secrets from external providers (1Password, Vault). Tuning adapters (`src/niche/optimizer/tuning-adapters.ts`) build job metadata and lineage but do not execute API calls (line 50: "execution remains out of scope").

## When to Revisit

- When a pilot niche demonstrates lift via system specialization and the operator wants to explore further gains
- When a provider offers tuning APIs for the frontier model in use
- When the cost/benefit of tuning justifies the credential management investment

## Residual Risk

Operators expecting automatic model fine-tuning will find that the optimizer plans jobs but cannot execute them. This is mitigated by clear documentation in the CLI help text and this scope document.
