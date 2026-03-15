---
summary: "The compiled, machine-usable representation of a niche domain -- produced from source descriptors and consumed by the runtime, benchmarks, and optimizer."
read_when:
  - You want to understand what a DomainPack contains
  - You are working with the compile step of NicheClaw
  - You need to know how source descriptors become runtime-usable knowledge
title: "Domain Pack"
---

# Domain Pack

A Domain Pack is the compiled output of `openclaw niche compile`. It transforms the raw source descriptors declared in a [Niche Program](/niche/concepts/niche-program) into a structured, machine-usable representation that the runtime, benchmarks, verifiers, and optimizer can consume.

A Domain Pack is not a model checkpoint or a set of weights. It is a structured knowledge artifact that captures the ontology, task taxonomy, terminology, constraints, tool contracts, evidence sources, failure modes, verifier defaults, and benchmark seed specifications for a niche.

## What a Domain Pack contains

| Field                      | Type                               | Description                                                                                                                                                                                                                                            |
| -------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain_pack_id`           | `string`                           | Unique identifier for this compiled pack, derived from the program ID and compilation version.                                                                                                                                                         |
| `niche_program_id`         | `string`                           | The Niche Program this pack was compiled from.                                                                                                                                                                                                         |
| `version`                  | `string`                           | A version string, either operator-specified or auto-generated from a content hash.                                                                                                                                                                     |
| `ontology`                 | object                             | The domain's concept graph. Contains a list of `concepts` (each with `id`, `label`, optional `description`) and `relations` between them (each with `relation_id`, `source_concept_id`, `target_concept_id`, `relation_type`, optional `description`). |
| `task_taxonomy`            | `TaskFamily[]`                     | Categorized families of tasks the niche covers. Each family has a `task_family_id`, `label`, optional `description`, a `benchmarkable` flag, and a list of `required_capabilities`.                                                                    |
| `terminology_map`          | `Record<string, TerminologyEntry>` | Domain-specific vocabulary. Each entry maps a key to a `canonical_term`, a list of `synonyms`, and an optional `definition`. Used for consistent terminology in prompts and grading.                                                                   |
| `constraints`              | `DomainConstraint[]`               | Hard rules the domain enforces. Each constraint has a `constraint_id`, `category`, `rule` (the actual constraint statement), optional `rationale`, and a `severity` (`low`, `moderate`, or `high`).                                                    |
| `tool_contracts`           | `ToolContract[]`                   | Typed contracts for each tool the specialization may invoke. Each contract specifies `tool_name`, `intent_summary`, `required_arguments`, `optional_arguments`, and `failure_modes`.                                                                   |
| `evidence_source_registry` | `EvidenceSource[]`                 | Registry of all evidence sources available at runtime. Each source has a `source_id`, `source_kind`, `title`, `access_pattern`, and optional `freshness_expectation` and `trust_notes`.                                                                |
| `failure_taxonomy`         | `FailureMode[]`                    | Categorized failure modes the domain can encounter. Each entry has a `failure_id`, `label`, `description`, `severity`, and `detection_hints` -- strings describing how to detect the failure.                                                          |
| `verifier_defaults`        | object                             | Default verification configuration. Specifies `required_checks`, `blocking_failure_ids` (failures that block delivery), `output_requirements`, and an `escalation_policy`.                                                                             |
| `benchmark_seed_specs`     | `BenchmarkSeedSpec[]`              | Seed specifications for generating benchmark cases. Each seed has a `seed_id`, `task_family_id`, `prompt`, `source_refs`, `pass_conditions`, and `hard_fail_conditions`.                                                                               |

## How a Domain Pack gets created

1. The operator writes a [Niche Program](/niche/concepts/niche-program) declaring allowed sources and tools.
2. The operator provides source descriptors -- pointers to the actual data files, repos, logs, or APIs.
3. Running `openclaw niche compile` triggers the compilation flow:
   - Source descriptors are normalized into `NormalizedSourceRecord` entries. Sources must have `rights_to_store` and belong to the `train` or `dev` data zone. Quarantined sources are rejected.
   - The compiler synthesizes the normalized source content and program metadata into each Domain Pack field (ontology, task taxonomy, constraints, etc.).
   - A source access manifest is generated, recording which tools, retrieval indices, live sources, and sandbox/network policies apply.
   - A content-hash-based version is assigned (unless the operator provides an explicit version).
   - A [Readiness Report](/niche/concepts/readiness) is generated alongside the Domain Pack.
4. The Domain Pack, source access manifest, and readiness report are persisted to the NicheClaw state root.

## How the Domain Pack is used

- **Runtime:** The planner uses the ontology, terminology map, constraints, and tool contracts to ground its task planning and execution.
- **Benchmarking:** The `benchmark_seed_specs` drive benchmark case generation. The `task_taxonomy` determines which task families are benchmarkable.
- **Verification:** The `verifier_defaults` and `failure_taxonomy` configure output verification and escalation.
- **Optimization:** The optimizer references the Domain Pack to generate candidate recipes that improve on the baseline.
- **Release:** The Domain Pack is a component of the [Niche Stack](/niche/concepts/niche-stack) that gets promoted through the release pipeline.

## Relationship to readiness

Compilation always produces both a Domain Pack and a Readiness Report. The readiness gate evaluates whether the Domain Pack is sufficient for benchmarking based on source quality, coverage, contradiction rate, and other dimensions. See [Readiness](/niche/concepts/readiness) for details.

A Domain Pack that does not pass readiness cannot proceed to benchmarking or release.
