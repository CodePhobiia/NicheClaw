---
summary: "How NicheClaw fits into OpenClaw: three-plane architecture, state storage, Niche Stacks, and specialization lanes."
read_when:
  - You want to understand how NicheClaw works internally
  - You need to know where NicheClaw stores state
title: "Architecture Overview"
---

# Architecture Overview

NicheClaw extends OpenClaw with a governed specialization framework organized into three planes.

## Three-plane architecture

**Serving plane** — The OpenClaw runtime that handles message routing, agent execution, and tool calls. NicheClaw injects specialized behavior here through the active Niche Stack.

**Control plane** — The `openclaw niche` CLI that operators use to define programs, compile knowledge, assess readiness, and manage releases. All control plane operations produce typed JSON artifacts stored under `~/.openclaw/niche/`.

**Optimization plane** — The benchmark and release subsystems that evaluate whether a specialized candidate outperforms the baseline. This plane also includes the optimizer for candidate generation, data synthesis, and continuous improvement loops.

## State storage

NicheClaw state lives under `~/.openclaw/niche/` with the following directory structure:

```
~/.openclaw/niche/
├── programs/          # NicheProgram definitions
├── domain-packs/      # Compiled domain packs and compilation records
├── manifests/
│   ├── baseline/      # Baseline manifest JSON files
│   ├── candidate/     # Candidate manifest JSON files
│   └── source-access/ # Source access manifest files
├── readiness-reports/ # Readiness assessment reports
├── benchmark-suites/  # Benchmark suite definitions
├── benchmark-runs/    # Benchmark result records
├── traces/            # Run trace records
├── replay-bundles/    # Replay bundle archives
├── artifacts/         # Artifact registry (by type)
├── lineage/           # Artifact lineage graph edges
├── releases/          # Release state and active stacks
├── monitors/          # Promoted release monitors
├── graders/           # Grader artifacts and calibration
└── jobs/              # Optimizer job records
```

All store operations go through the store boundary module (`src/niche/store/`). The storage backend is file-based JSON with atomic writes.

## The Niche Stack

A Niche Stack is the complete deployable unit of specialization. It is not just model weights — it includes:

| Component       | Description                                                             |
| --------------- | ----------------------------------------------------------------------- |
| Planner runtime | The model and provider configuration                                    |
| Domain Pack     | Compiled domain knowledge (ontology, constraints, tool contracts, etc.) |
| Action policy   | Tool selection and argument validation rules                            |
| Retrieval stack | Evidence source access and ranking configuration                        |
| Verifier pack   | Output verification checks and failure detection                        |
| Benchmark suite | Evaluation cases for measuring performance                              |
| Release policy  | Promotion thresholds and rollback triggers                              |

The key insight: even if the runtime model cannot be weight-tuned, the system can still learn through the surrounding stack and still prove lift. A Niche Stack with a frozen model but an optimized domain pack, retrieval config, and verifier can meaningfully outperform a general-purpose agent.

## Specialization lanes

NicheClaw supports four specialization lanes, selected in the Niche Program:

| Lane                            | Description                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `system_specialization`         | Always available. Optimize the surrounding system: retrieval, reranking, tool selection, repair policy, verifier behavior, routing, calibration. |
| `distillation`                  | A frontier teacher generates trajectories, preferences, and repairs that are distilled into smaller policies or student models.                  |
| `provider_native_customization` | Use the model provider's native fine-tuning API when available (OpenAI, Anthropic, Google).                                                      |
| `prompt_policy_assets`          | Prompt assets and policy documents. Auxiliary — not the primary proof of value.                                                                  |

Start with `system_specialization` and `prompt_policy_assets`. Add `distillation` when you have enough traces. Add `provider_native_customization` when provider APIs are available.

## Pipeline flow

```
Sources ──→ Compiler ──→ Domain Pack + Readiness Report
                              │
                              ▼
                    Baseline Manifest ◄──── Same model config
                    Candidate Manifest ◄── + Domain Pack
                              │
                              ▼
                        Benchmark ──→ Delta (candidate vs baseline)
                              │
                              ▼
                    Release Decision ──→ Promote / Reject / Shadow / Canary
                              │
                              ▼
                    Active Niche Stack ──→ Live traffic routing
```
