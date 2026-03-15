## Onboarding Dimension Remediation Plan

### Executive Summary

The Onboarding dimension scores 35/100 because NicheClaw has a functional 12-step interactive CLI quickstart and comprehensive CLI help text, but zero documentation files, no written guides, no example projects, no readiness improvement guidance, and no artifact format reference. Operators can create a niche program but have no way to understand what they created, why it scored "not_ready", or what to do next. This plan creates a complete documentation surface from scratch.

### Current State Assessment

**What exists (35 points):**

- `openclaw niche quickstart` -- 12-step interactive CLI that creates a program, compiles it, builds manifests, and prints artifact paths
- `register.niche.ts` -- comprehensive CLI help with examples for every subcommand
- `openclaw niche init --write-starter-program` -- seeds a repo-ci-specialist program
- `src/niche/pilots/repo-ci/` -- a full reference pilot with seed domain pack and benchmark suites
- Typed schemas for every artifact (NicheProgram, DomainPack, ReadinessReport, etc.)

**What is missing (0-65 gap):**

- Zero files under `docs/niche/`
- No Mintlify navigation entries for NicheClaw
- Quickstart output is path-only -- no explanation of what each artifact means
- Readiness report says "not_ready" with blocker codes but no operator-facing remediation guidance
- No written walkthrough of the full pipeline (create -> compile -> benchmark -> release)
- No example niche project an operator can copy
- No artifact format reference (operators must read TypeBox schema definitions)
- No troubleshooting guide
- No architecture overview for operators
- No concept docs explaining the mental model (Niche Stack, Domain Pack, readiness, specialization lanes)

---

### Remediation Items

---

#### OB-01: Create Mintlify navigation structure for docs/niche/

**Priority:** Required (prerequisite for all other items)
**Effort:** Small

**Rationale:** All subsequent documentation files need a home in the Mintlify navigation tree. The existing `docs/docs.json` has no NicheClaw entries. Without this, docs pages would exist on disk but be unreachable in the sidebar.

**Deliverables:**

1. Add a new tab entry `"NicheClaw"` to the `navigation.languages[0].tabs` array in `docs/docs.json`, following the pattern of existing tabs (Get started, Install, etc.)
2. Define groups within the tab:
   - "Overview" -- `niche/index`, `niche/architecture`
   - "Concepts" -- `niche/concepts/niche-program`, `niche/concepts/domain-pack`, `niche/concepts/readiness`, `niche/concepts/niche-stack`, `niche/concepts/specialization-lanes`
   - "Guides" -- `niche/guides/getting-started`, `niche/guides/quickstart-walkthrough`, `niche/guides/improving-readiness`, `niche/guides/first-benchmark`, `niche/guides/release-promotion`
   - "Reference" -- `niche/reference/artifact-formats`, `niche/reference/cli-commands`, `niche/reference/readiness-dimensions`, `niche/reference/troubleshooting`
   - "Examples" -- `niche/examples/repo-ci-specialist`

**Key file:** `docs/docs.json` (lines 815+, navigation structure)

---

#### OB-02: Write the NicheClaw overview page (docs/niche/index.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** Operators arriving at the NicheClaw docs need a single page that answers: what is NicheClaw, who is it for, and what does it do? Currently no such page exists. This is the landing page for the NicheClaw tab.

**Deliverables:**

1. Create `docs/niche/index.md` with Mintlify frontmatter following the existing pattern (see `docs/start/getting-started.md` for frontmatter format: `summary`, `read_when`, `title`)
2. Content sections:
   - **What is NicheClaw** -- one paragraph defining it as "a governed AI agent specialization framework built into OpenClaw that compiles niche knowledge, benchmarks candidates against baselines, and promotes winners"
   - **Who is it for** -- operators/builders who want measurable agent specialization, not prompt packs
   - **The core promise** -- from PRD section 3: "Choose a niche, connect your data and tools, choose your runtime model, and NicheClaw will build and validate a specialized version of that agent before it goes live"
   - **The pipeline at a glance** -- numbered steps: (1) Define a Niche Program, (2) Compile domain knowledge, (3) Achieve readiness, (4) Benchmark baseline vs candidate, (5) Release the winner
   - **Quick links** -- links to Getting Started guide, Concepts, CLI Reference, Example Project
3. Use the Mintlify `<Steps>` component for the pipeline overview (per existing pattern in `docs/start/getting-started.md`)

**Source material:** `NICHECLAW_PRD_V3.md` sections 3, 4, 6, and 7

---

#### OB-03: Write the architecture overview for operators (docs/niche/architecture.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** Operators need a mental model of how NicheClaw fits into OpenClaw without reading the PRD or source code. The PRD section 9 defines three planes (serving, control, optimization) but this is not documented anywhere operators can find it.

**Deliverables:**

1. Create `docs/niche/architecture.md`
2. Content sections:
   - **Three-plane architecture** -- Serving plane (OpenClaw runtime), Control plane (niche CLI), Optimization plane (benchmark + release)
   - **State storage** -- explain that NicheClaw state lives under `~/.openclaw/niche/` with subdirectories for programs, domain-packs, manifests, readiness-reports, benchmark-runs, traces, artifacts, releases, etc. (derived from `src/niche/constants.ts` NICHE_STATE_DIRNAMES and `src/niche/store/paths.ts`)
   - **The Niche Stack** -- what gets deployed: planner runtime + domain pack + action policy + retrieval stack + verifier pack + benchmark suite + release policy + optional student models (from PRD section 7)
   - **Specialization Lanes** -- the four lanes: system_specialization, distillation, provider_native_customization, prompt_policy_assets (from `src/niche/schema/common.ts` SPECIALIZATION_LANES)
   - **ASCII diagram** of the pipeline flow: Sources -> Compiler -> Domain Pack + Readiness -> Benchmark (baseline vs candidate) -> Release Decision
3. No code snippets -- this is a conceptual overview. Link to CLI reference and concept docs for details.

**Source material:** `NICHECLAW_PRD_V3.md` sections 7-9, `src/niche/constants.ts`, `src/niche/store/paths.ts`

---

#### OB-04: Write concept doc -- Niche Program (docs/niche/concepts/niche-program.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** The NicheProgram is the first artifact an operator creates and the foundation of everything else. Operators need to understand each field before they can write a good one. Currently the only documentation is the TypeBox schema in `src/niche/schema/program.ts`.

**Deliverables:**

1. Create `docs/niche/concepts/niche-program.md`
2. Content:
   - **What is a Niche Program** -- the operator-owned specialization definition; the "blueprint" that tells NicheClaw what to specialize
   - **Required fields** with plain-English descriptions of each:
     - `niche_program_id` -- lowercase slug identifier (pattern: `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`)
     - `name` -- human-readable name
     - `objective` -- what the specialization should achieve
     - `risk_class` -- low, moderate, or high (explain what each means)
     - `runtime_stack` -- planner runtime + optional retrieval/verifier components + specialization lanes
     - `allowed_tools` -- which tools the niche can use
     - `allowed_sources` -- approved data sources with source_kind from the 10 source kinds
     - `success_metrics` -- how success is measured (objective: maximize/minimize/target)
     - `rights_and_data_policy` -- governance policies for storage, training, benchmark, retention, redaction, PII, live trace reuse
   - **Complete example** -- the starter program from `src/commands/niche/init.ts` (the repo-ci-specialist), formatted as JSON with inline comments
   - **Tips for writing good objectives** -- specific, measurable, scoped to a domain
   - **Tips for choosing risk class** -- based on the consequence of agent errors
3. List all 10 source kinds from `src/niche/schema/common.ts` SOURCE_KINDS with one-line descriptions

**Source material:** `src/niche/schema/program.ts`, `src/niche/schema/common.ts`, `src/commands/niche/init.ts` lines 66-165

---

#### OB-05: Write concept doc -- Domain Pack (docs/niche/concepts/domain-pack.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** The DomainPack is the compiled output of the niche compiler. Operators see it referenced in compilation output but have no idea what it contains or why it matters. The PRD says "Without this step, NicheClaw collapses into RAG."

**Deliverables:**

1. Create `docs/niche/concepts/domain-pack.md`
2. Content:
   - **What is a Domain Pack** -- the compiled machine-usable representation of the niche, produced by the compiler from source descriptors
   - **What it contains** -- explain each field from `src/niche/schema/domain-pack.ts`:
     - `ontology` -- concepts and their relationships in the domain
     - `task_taxonomy` -- task families the niche covers, with benchmarkability flags
     - `terminology_map` -- canonical terms, synonyms, definitions
     - `constraints` -- domain rules the agent must follow, with severity levels
     - `tool_contracts` -- how each tool should be used, required/optional arguments, failure modes
     - `evidence_source_registry` -- approved evidence sources
     - `failure_taxonomy` -- known failure modes with detection hints
     - `verifier_defaults` -- required checks, blocking failures, output requirements
     - `benchmark_seed_specs` -- seed benchmark cases generated from the domain
   - **How it gets created** -- `openclaw niche compile` takes source descriptors and produces the domain pack via the compiler
   - **Complete example** -- the repo-ci seed domain pack from `src/niche/pilots/repo-ci/seed-domain-pack.ts`, formatted as JSON
3. Link to the Readiness concept doc (domain pack quality directly affects readiness scores)

**Source material:** `src/niche/schema/domain-pack.ts`, `src/niche/pilots/repo-ci/seed-domain-pack.ts`

---

#### OB-06: Write concept doc -- Readiness (docs/niche/concepts/readiness.md)

**Priority:** Required (directly addresses gap #5)
**Effort:** Large

**Rationale:** Operators get "not_ready" from the quickstart and have no idea what that means or how to fix it. This is the single most impactful documentation gap. The readiness system has 9 dimension scores, 5 hard blocker codes, warnings, and recommended actions -- none of which are documented outside TypeScript source.

**Deliverables:**

1. Create `docs/niche/concepts/readiness.md`
2. Content:
   - **What is Readiness** -- the gate that determines whether a niche can proceed to benchmarking and release
   - **Three statuses** -- `ready`, `ready_with_warnings`, `not_ready` and what each means
   - **The 9 readiness dimensions** -- a table with each dimension, what it measures, how the score is computed, and the default threshold:
     - `source_quality` (min 70) -- proportion of sources with verified provenance and clean redaction
     - `source_coverage` (min 30) -- coverage of distinct source kinds (out of 10 available)
     - `contradiction_rate` (max 30) -- pairwise contradiction pressure between sources
     - `freshness` (min 60) -- how current approved sources are
     - `rights_sufficiency` (min 80) -- proportion of 6 rights flags that are true
     - `task_observability` (min 50) -- observability of task steps and outcomes
     - `benchmarkability` (min 50) -- number of benchmark seeds (each adds 25 points)
     - `measurable_success_criteria` (min 70) -- clarity of success metrics (base 50 + 20 per metric)
     - `tool_availability` (min 80) -- tool set coverage (base 50 + 15 per tool)
   - **Hard blockers** -- the 5 codes that force "not_ready":
     - `insufficient_rights_to_use` -- storage/benchmark rights missing
     - `benchmarkability_below_minimum_threshold` -- fewer than 2 benchmark seeds
     - `contradiction_rate_exceeds_hard_threshold` -- contradiction above 30%
     - `tool_availability_inadequate_for_workflow` -- tool score below 80
     - `source_coverage_too_low_for_benchmarkable_domain_pack` -- coverage below 30%
   - **Warnings** -- conditions that produce `ready_with_warnings`
   - **Recommended actions** -- how the system generates `recommended_next_actions`
   - **How to check readiness** -- `openclaw niche readiness --niche-program-id <id>`
3. Prominently link to the "Improving Readiness" guide (OB-10)

**Source material:** `src/niche/domain/readiness-thresholds.ts`, `src/niche/domain/readiness-gate.ts`, `src/niche/domain/compile-flow.ts` lines 132-181, `src/niche/schema/readiness.ts`

---

#### OB-07: Write concept doc -- Niche Stack (docs/niche/concepts/niche-stack.md)

**Priority:** Required
**Effort:** Small

**Rationale:** The PRD defines the Niche Stack as the central product object, but operators have no documentation explaining what it is or what it contains.

**Deliverables:**

1. Create `docs/niche/concepts/niche-stack.md`
2. Content:
   - **What is a Niche Stack** -- the deployed product artifact; the unit of specialization, not just model weights
   - **Components** -- planner_runtime, domain_pack, action_policy, retrieval_stack, verifier_pack, benchmark_suite, release_policy, optional_student_models
   - **Why the whole stack matters** -- "If the runtime model cannot be weight-tuned, the system can still learn through the surrounding stack and still prove lift"
   - **How stacks are compared** -- baseline stack (general agent) vs candidate stack (specialized agent), same model, same tools, same source access
   - **Link to release docs** -- how a candidate stack becomes promoted

**Source material:** `NICHECLAW_PRD_V3.md` section 7, `src/niche/schema/manifests.ts` (BaselineManifest, CandidateManifest)

---

#### OB-08: Write concept doc -- Specialization Lanes (docs/niche/concepts/specialization-lanes.md)

**Priority:** Recommended
**Effort:** Small

**Rationale:** The 4 specialization lanes are a core NicheClaw concept that operators select when defining their program but have no documentation.

**Deliverables:**

1. Create `docs/niche/concepts/specialization-lanes.md`
2. Content:
   - **The four lanes** with explanations:
     - `system_specialization` -- always available; train/optimize the surrounding system (retrieval, reranking, tool selection, repair policy, verifier behavior, routing, calibration)
     - `distillation` -- frontier teacher generates trajectories/preferences/repairs, distilled into smaller policies or student models
     - `provider_native_customization` -- provider-native fine-tuning when the model family exposes it
     - `prompt_policy_assets` -- prompt assets; auxiliary, not the primary proof of value
   - **How to choose** -- start with `prompt_policy_assets` + `system_specialization`; add distillation when you have enough traces; add provider customization when provider APIs are available
   - **Selecting lanes in the NicheProgram** -- the `runtime_stack.specialization_lanes` array

**Source material:** `NICHECLAW_PRD_V3.md` section 8, `src/niche/schema/common.ts` SPECIALIZATION_LANES

---

#### OB-09: Write the Getting Started guide (docs/niche/guides/getting-started.md)

**Priority:** Required (addresses gap #1)
**Effort:** Large

**Rationale:** This is the most important single documentation deliverable. Operators need a step-by-step walkthrough from zero to a compiled, readiness-assessed niche program. The existing quickstart CLI exists but produces opaque output with no explanation.

**Deliverables:**

1. Create `docs/niche/guides/getting-started.md`
2. Structure using the Mintlify `<Steps>` component (matching `docs/start/getting-started.md` pattern)
3. Content -- a complete walkthrough:
   - **Prerequisites** -- Node 22+, OpenClaw installed, gateway running
   - **Step 1: Initialize NicheClaw** -- `openclaw niche init --write-starter-program`; explain what it creates (state roots, starter program); explain the PRD.md and ARCHITECTURE.md anchor requirements
   - **Step 2: Define your Niche Program** -- either use the starter program or write your own; link to the NicheProgram concept doc; show a minimal realistic example
   - **Step 3: Store the program** -- `openclaw niche create --program ./my-program.json`; explain what gets stored and where
   - **Step 4: Prepare source descriptors** -- explain the 4 input kinds (local_file, repo_asset, structured_text, benchmark_seed); show a minimal source descriptor JSON
   - **Step 5: Compile** -- `openclaw niche compile --niche-program-id <id> --source ./source.json`; explain what compilation produces (domain pack, source access manifest, readiness report, compilation record)
   - **Step 6: Check readiness** -- `openclaw niche readiness --niche-program-id <id>`; explain the output; link to "Improving Readiness" guide if not_ready
   - **Step 7: Next steps** -- link to benchmark guide, release guide, optimization guide
4. Include expected CLI output for each step
5. Use Mintlify `<Info>`, `<Tip>`, and `<Warning>` callouts where appropriate

**Source material:** `src/commands/niche/init.ts`, `src/commands/niche/create.ts`, `src/commands/niche/compile.ts`, `src/niche/schema/source-ingest.ts` (source descriptor schemas)

---

#### OB-10: Write the Improving Readiness guide (docs/niche/guides/improving-readiness.md)

**Priority:** Required (directly addresses gap #5)
**Effort:** Large

**Rationale:** The quickstart routinely produces "not_ready" for realistic inputs. The readiness report contains blocker codes and recommended actions, but operators have no guide explaining what to do for each blocker. This is the second most impactful documentation gap after OB-09.

**Deliverables:**

1. Create `docs/niche/guides/improving-readiness.md`
2. Content -- a remediation playbook organized by blocker code:
   - **Reading the readiness report** -- how to interpret the JSON output and dimension scores
   - **For `insufficient_rights_to_use`** -- ensure `rights_to_store: true` and `rights_to_benchmark: true` in all source descriptors; explain the 6 rights flags and what they mean
   - **For `benchmarkability_below_minimum_threshold`** -- add more benchmark seeds to source descriptors (each seed adds 25 points; need at least 2 for score >= 50); show how to write a `benchmark_seed` source descriptor
   - **For `contradiction_rate_exceeds_hard_threshold`** -- review sources for overlapping content with conflicting metadata; ensure provenance_status and quarantine status are consistent; remove or quarantine contradictory sources
   - **For `tool_availability_inadequate_for_workflow`** -- add more tools to `allowed_tools` in the NicheProgram (each adds 15 points to a base of 50; need score >= 80, so at least 2 tools)
   - **For `source_coverage_too_low_for_benchmarkable_domain_pack`** -- add sources from more source kinds (score is `(distinct_source_kinds / 10) * 100`; need at least 3 kinds for score >= 30)
   - **Improving warning dimensions** -- guidance for low_source_quality, low_freshness, low_task_observability, weak_success_criteria, rights_need_review
   - **Worked example** -- take the not_ready output from a minimal quickstart, identify blockers, fix them, recompile, achieve "ready"
3. Include exact formula references so operators can calculate expected scores before recompiling

**Source material:** `src/niche/domain/readiness-gate.ts`, `src/niche/domain/readiness-thresholds.ts`, `src/niche/domain/compile-flow.ts` lines 92-181

---

#### OB-11: Write the Quickstart Walkthrough (docs/niche/guides/quickstart-walkthrough.md)

**Priority:** Required (addresses gap #3)
**Effort:** Medium

**Rationale:** The interactive `openclaw niche quickstart` CLI exists but operators do not understand what each of its 12 steps means or what the output artifacts are. This guide annotates the quickstart step-by-step.

**Deliverables:**

1. Create `docs/niche/guides/quickstart-walkthrough.md`
2. Content:
   - **What the quickstart does** -- creates a NicheProgram, compiles it with inline sources, builds baseline+candidate manifests, evaluates readiness
   - **Step-by-step annotation** for each of the 12 prompts in `src/commands/niche/quickstart.ts`:
     1. Program name -- becomes the slug identifier via `slugify()`
     2. Objective -- what should the specialization achieve
     3. Risk class -- low/moderate/high, explain implications
     4. Provider -- default "anthropic", explain other options
     5. Model -- default "claude-sonnet-4-5-20250514", explain compatibility
     6. API mode -- default "messages", when to change
     7. Allowed tools -- which tools to enable
     8. Source paths -- comma-separated file paths; these become structured_text sources
     9. Success metric label
     10. Metric objective -- maximize/minimize/target
     11. Metric target description
     12. Metric measurement method
   - **Understanding the output** -- explain each artifact path printed in the "Quickstart Artifacts" note:
     - Program path -- the stored NicheProgram JSON
     - Compilation record path -- the full compilation record including domain pack
     - Source access manifest path -- what the agent is allowed to access
     - Readiness report path -- the readiness assessment
     - Baseline manifest path -- the general agent configuration
     - Candidate manifest path -- the specialized agent configuration
   - **What to do after quickstart** -- link to improving readiness if not_ready, link to benchmark guide if ready

**Source material:** `src/commands/niche/quickstart.ts`

---

#### OB-12: Write the First Benchmark guide (docs/niche/guides/first-benchmark.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** After achieving readiness, operators need to know how to run their first benchmark comparing baseline vs candidate. The CLI help shows the command but does not explain the workflow or required inputs.

**Deliverables:**

1. Create `docs/niche/guides/first-benchmark.md`
2. Content:
   - **Prerequisites** -- readiness status "ready" or "ready_with_warnings", baseline and candidate manifests, a benchmark suite
   - **What is a benchmark** -- same-model comparison; baseline (general agent) vs candidate (specialized agent) under identical conditions
   - **Building a benchmark suite** -- explain EvalCase and EpisodeCase structure from `src/niche/schema/benchmark.ts`; reference the repo-ci pilot suites
   - **Running a live benchmark** -- `openclaw niche benchmark --live --baseline-manifest <path> --candidate-manifest <path> --suite <path> --readiness-report <path> --json`
   - **Understanding results** -- explain BenchmarkResultRecord fields, paired delta summaries, contamination audit
   - **Interpreting the outcome** -- when results support promotion vs when they do not
   - **Next steps** -- link to release/promotion guide

**Source material:** `src/commands/niche/benchmark.ts`, `src/niche/schema/benchmark.ts`, `src/niche/pilots/repo-ci/seed-benchmark-suite.ts`

---

#### OB-13: Write the Release and Promotion guide (docs/niche/guides/release-promotion.md)

**Priority:** Recommended
**Effort:** Medium

**Rationale:** The release command is the final step in the pipeline. Operators need to understand what a promotion decision is and what inputs are required.

**Deliverables:**

1. Create `docs/niche/guides/release-promotion.md`
2. Content:
   - **What is a release** -- evaluating whether a candidate should replace the baseline
   - **Release decisions** -- promoted, rejected, shadow, canary, experimental (from `src/niche/schema/release.ts` CANDIDATE_RELEASE_DECISIONS)
   - **Required inputs** -- baseline manifest, candidate manifest, benchmark results, verifier metrics, promoted monitor, component artifact refs
   - **Running the release command** -- `openclaw niche release --baseline-manifest <path> --candidate-manifest <path> --benchmark-result <path> --verifier-metrics <path> --monitor <path> --component-artifact-ref <path> --json`
   - **Understanding the decision** -- what each decision means and what happens next
   - **Rollback** -- rollback target and when it is used

**Source material:** `src/niche/schema/release.ts`, `src/commands/niche/release.ts` (via register.niche.ts)

---

#### OB-14: Write the Artifact Format Reference (docs/niche/reference/artifact-formats.md)

**Priority:** Required (addresses gap #6)
**Effort:** Large

**Rationale:** Operators must currently reverse-engineer JSON schemas from TypeBox definitions to understand artifact formats. This reference provides human-readable JSON Schema documentation for every NicheClaw artifact.

**Deliverables:**

1. Create `docs/niche/reference/artifact-formats.md`
2. Content -- for each major artifact type, provide:
   - Schema name and purpose (one sentence)
   - Complete field table: field name, type, required/optional, description, constraints (patterns, min/max values)
   - A minimal valid JSON example
3. Artifacts to document:
   - **NicheProgram** (from `src/niche/schema/program.ts`)
   - **DomainPack** (from `src/niche/schema/domain-pack.ts`)
   - **ReadinessReport** (from `src/niche/schema/readiness.ts`)
   - **SourceAccessManifest** (from `src/niche/schema/manifests.ts`)
   - **BaselineManifest** (from `src/niche/schema/manifests.ts`)
   - **CandidateManifest** (from `src/niche/schema/manifests.ts`)
   - **Source descriptors** -- all 4 input kinds (from `src/niche/schema/source-ingest.ts`)
   - **NicheCompilationRecord** (from `src/niche/schema/compile-record.ts`)
   - **EvalCase / EpisodeCase** (from `src/niche/schema/benchmark.ts`)
   - **CandidateRelease** (from `src/niche/schema/release.ts`)
4. Document common field types: IdentifierString pattern, VersionString pattern, HashString pattern, TimestampString pattern (from `src/niche/schema/common.ts`)
5. Document enum values: RiskClass, SourceKind, MetricObjective, SpecializationLane, DataZone, ArtifactType, BenchmarkCaseKind, RunTraceMode, ReplayabilityStatus, CandidateReleaseDecision

**Source material:** All files under `src/niche/schema/`

---

#### OB-15: Write the CLI Commands Reference (docs/niche/reference/cli-commands.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** While `register.niche.ts` has inline help and examples, there is no documentation page operators can read without a terminal. This reference mirrors the existing CLI docs pattern under `docs/cli/`.

**Deliverables:**

1. Create `docs/niche/reference/cli-commands.md`
2. Content -- for each subcommand, document:
   - Purpose (one sentence)
   - Full syntax with all flags
   - Required vs optional flags
   - Example usage (from `register.niche.ts` help examples)
   - Expected output format
3. Subcommands to document:
   - `openclaw niche init`
   - `openclaw niche create`
   - `openclaw niche compile`
   - `openclaw niche readiness`
   - `openclaw niche prepare-run`
   - `openclaw niche run`
   - `openclaw niche benchmark`
   - `openclaw niche optimize`
   - `openclaw niche release`
   - `openclaw niche inspect`
   - `openclaw niche compare`
   - `openclaw niche quickstart`
4. Follow the format pattern used in existing CLI docs (e.g., `docs/cli/agent.md`)

**Source material:** `src/cli/program/register.niche.ts`

---

#### OB-16: Write the Readiness Dimensions Reference (docs/niche/reference/readiness-dimensions.md)

**Priority:** Required
**Effort:** Medium

**Rationale:** This is a focused reference table that operators can consult quickly when their readiness score is low. Complements the concept doc (OB-06) and the improving readiness guide (OB-10) with precise formulas and threshold values.

**Deliverables:**

1. Create `docs/niche/reference/readiness-dimensions.md`
2. Content:
   - **Dimension score table** -- dimension name, formula, default threshold, hard blocker (yes/no), blocker code
   - **Score formulas** (derived from `src/niche/domain/compile-flow.ts` lines 132-181):
     - `source_quality` = `(verified_and_clean_sources / total_sources) * 100`
     - `source_coverage` = `(distinct_source_kinds / 10) * 100`
     - `contradiction_rate` = pairwise contradiction percentage (higher is worse)
     - `freshness` = `60 + (sources_with_freshness_expectation * 15)`, capped at 100
     - `rights_sufficiency` = `(passing_rights_flags / 6) * 100`
     - `task_observability` = varies based on task count and tool count
     - `benchmarkability` = `benchmark_seed_count * 25`, capped at 100
     - `measurable_success_criteria` = `50 + (metric_count * 20)`, capped at 100
     - `tool_availability` = `50 + (tool_count * 15)`, capped at 100
   - **Default thresholds** -- from `src/niche/domain/readiness-thresholds.ts` DEFAULT_READINESS_THRESHOLDS
   - **Status determination** -- hard blockers -> not_ready, warnings only -> ready_with_warnings, neither -> ready

**Source material:** `src/niche/domain/readiness-thresholds.ts`, `src/niche/domain/compile-flow.ts`, `src/niche/domain/readiness-gate.ts`

---

#### OB-17: Write the Troubleshooting guide (docs/niche/reference/troubleshooting.md)

**Priority:** Required (addresses gap #7)
**Effort:** Medium

**Rationale:** Common errors and their solutions are not documented. Operators hitting errors in the CLI have no troubleshooting resource.

**Deliverables:**

1. Create `docs/niche/reference/troubleshooting.md`
2. Content -- organized as problem/solution pairs:
   - **"Missing or invalid NicheClaw architecture anchor: PRD.md"** -- `niche init` requires PRD.md and ARCHITECTURE.md in the current directory, both mentioning "nicheclaw"; solution: create these files or run init from the correct directory
   - **"No stored niche program exists for X"** -- run `openclaw niche create` first before compile
   - **"No stored readiness report exists for niche program X"** -- run `openclaw niche compile` first to generate a readiness report
   - **"At least one source descriptor is required"** -- pass `--source` flag to compile
   - **"Source X cannot be compiled because rights_to_store is false"** -- set `rights.rights_to_store: true` in the source descriptor
   - **"Source X cannot be compiled from data zone Y"** -- only `train` and `dev` zones are allowed for compilation; change `data_zone`
   - **"Source X is quarantined and cannot be compiled"** -- set `quarantined: false` in source descriptor or resolve quarantine
   - **"inputKind must be one of local_file, repo_asset, structured_text, or benchmark_seed"** -- source descriptor JSON is missing or has invalid `inputKind`
   - **"The niche is not ready for specialization"** -- link to improving readiness guide
   - **"Baseline and candidate must use the same X for comparison"** -- manifests have mismatched execution invariants; ensure both use the same provider, model, suite, tools, etc.
   - **Schema validation errors** -- explain the validation error format and how to fix common field issues (identifier patterns, timestamp formats, etc.)

**Source material:** Error messages in `src/commands/niche/compile.ts`, `src/niche/domain/compile-flow.ts`, `src/niche/domain/readiness-enforcement.ts`, `src/niche/schema/manifests.ts`

---

#### OB-18: Create the example Repo CI Specialist project (docs/niche/examples/repo-ci-specialist.md)

**Priority:** Required (addresses gap #4)
**Effort:** Large

**Rationale:** The repo-ci pilot exists in code (`src/niche/pilots/repo-ci/`) but is not documented or packaged as a copyable example. Operators need a complete reference niche with all artifacts they can study and adapt.

**Deliverables:**

1. Create `docs/niche/examples/repo-ci-specialist.md`
2. Content:
   - **Overview** -- what the Repo CI Specialist does (specializes an agent for repository navigation, tool selection, repair loops, CI verification, and long-horizon repo workflows)
   - **The NicheProgram** -- complete JSON from `src/commands/niche/init.ts` buildStarterProgram(), with annotations explaining each choice
   - **Source descriptors** -- at least 3 example source descriptor JSONs covering different input kinds:
     - A `structured_text` source (repo documentation)
     - A `repo_asset` source (actual repo code)
     - A `benchmark_seed` source (adds benchmarkability)
   - **The Domain Pack** -- annotated JSON from `src/niche/pilots/repo-ci/seed-domain-pack.ts` showing all subsections (ontology, task taxonomy, constraints, tool contracts, failure taxonomy, etc.)
   - **The Benchmark Suite** -- annotated examples of atomic and episode cases from `src/niche/pilots/repo-ci/seed-benchmark-suite.ts`
   - **Expected readiness** -- what readiness scores this example achieves and why
   - **Step-by-step reproduction** -- exact CLI commands to recreate this niche from scratch
3. Structure as a self-contained tutorial that an operator can follow start-to-finish

**Source material:** `src/niche/pilots/repo-ci/seed-domain-pack.ts`, `src/niche/pilots/repo-ci/seed-benchmark-suite.ts`, `src/commands/niche/init.ts`, `test/niche/commands/create-compile-readiness.test.ts`

---

### Implementation Sequencing

**Phase 1 -- Foundation (OB-01 through OB-03):** Create the navigation structure, overview page, and architecture overview. These are prerequisites for all other docs -- they establish the doc home and the mental model.

**Phase 2 -- Concepts (OB-04 through OB-08):** Write the concept docs in dependency order: NicheProgram first (it is the entry point), then DomainPack (compiled from program), then Readiness (assessed during compilation), then Niche Stack and Specialization Lanes.

**Phase 3 -- Guides (OB-09 through OB-13):** Write the guides in pipeline order: Getting Started first, then Quickstart Walkthrough, then Improving Readiness (the most common next step), then First Benchmark, then Release Promotion.

**Phase 4 -- References and Examples (OB-14 through OB-18):** Write the reference material and the example project. The artifact format reference and CLI commands reference can be written in parallel. The troubleshooting guide depends on understanding common errors from the guides. The example project is the capstone that ties everything together.

**Parallelism:** Within each phase, items can be written in parallel since they reference different source files and have no file-level dependencies. Between phases, the dependency is conceptual (later phases link to earlier pages) but files can be created as stubs and cross-linked later.

---

### Critical Files for Implementation

- `docs/docs.json` - Mintlify navigation config that must be updated to add the NicheClaw tab and all page entries
- `src/niche/domain/compile-flow.ts` - Contains the readiness scoring formulas (lines 92-181) that must be accurately documented in OB-06, OB-10, OB-16
- `src/niche/domain/readiness-gate.ts` - Contains hard blocker logic, warning logic, and recommended action generation that must be documented in OB-06 and OB-10
- `src/commands/niche/quickstart.ts` - The 12-step quickstart flow that must be annotated step-by-step in OB-11
- `src/niche/pilots/repo-ci/seed-domain-pack.ts` - The reference pilot that forms the basis of the example project in OB-18
