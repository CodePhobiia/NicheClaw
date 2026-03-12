# NicheClaw PRD

## Document status

- Product: NicheClaw
- Role: canonical in-repo, implementation-facing product requirements document
- Status: active
- Supersedes: earlier NicheClaw drafts and notes
- Consolidates:
  - `NICHECLAW_PRD_V3.md`
  - `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`
  - `NICHECLAW_PRD_V3_1A_PATCH.md`

## Product definition

NicheClaw is a source-level OpenClaw fork that compiles a niche into a deployable, benchmarked Niche Stack and promotes it only when it outperforms a same-model OpenClaw baseline under governed evaluation.

Externally, the promise is: choose a niche, connect the relevant data and tools, pick a runtime model, and NicheClaw will build, benchmark, and validate a specialized version of that agent before it goes live.

Internally, NicheClaw is OpenClaw serving runtime plus a domain compiler, trace store, benchmark lab, artifact registry, verifier and action-policy layers, release engine, and optimization orchestrator.

## Product truth

NicheClaw is not a prompt pack, a generic RAG wrapper, or a claim that every frontier model can be directly fine-tuned.

NicheClaw is only considered real when all of the following are true:

- the niche is compiled into durable artifacts,
- runs become durable, benchmarkable traces,
- baseline and candidate are compared under same-model conditions unless explicitly marked otherwise,
- deployment is gated by release policy,
- improvements survive held-out evaluation and shadow validation.

## Core theses

- Specialization must be measured against a same-model general-agent control arm.
- The unit of specialization is the whole Niche Stack, not only model weights.
- The system must make specialization repeatable instead of bespoke.
- Weight tuning is optional; truthful whole-system lift is the product claim.

## Users

- Operator / Builder: defines niches, connects data and tools, runs benchmarks, and decides whether to promote.
- Reviewer / SME: inspects traces, graders, verifier decisions, and release evidence.
- End user: only cares that niche work is better, safer, and more reliable.

## Non-goals

NicheClaw is not:

- a prompt optimizer,
- a skill-library business dressed up as training,
- a generic retrieval layer,
- a guarantee of provider-native tuning support,
- a claim that benchmark wins exist without held-out evidence,
- a default autonomy stack for high-risk domains.

## The central product object: the Niche Stack

The deployed unit is the Niche Stack. It may include:

- `planner_runtime`
- `domain_pack`
- `action_policy`
- `retrieval_stack`
- `verifier_pack`
- `benchmark_suite`
- `release_policy`
- `optional_student_models`

This definition keeps the product honest when the live planner cannot be weight-tuned directly.

## Specialization lanes

NicheClaw must support the strongest valid lane available for the chosen stack:

- System specialization: domain compilation, retrieval, reranking, exemplar selection, tool selection, repair policy, verifier behavior, routing, and calibration.
- Distillation: teacher-generated traces, preferences, repairs, and step supervision distilled into smaller policies or student models.
- Provider-native customization: provider tuning or optimization paths when the model family, data rights, and infrastructure all support it.
- Prompt and policy assets: important, but auxiliary rather than the primary proof of value.

## Architecture model

NicheClaw keeps OpenClaw's serving plane and adds three additional planes:

- Control plane: niche creation, ingestion configuration, benchmark management, artifact inspection, release approvals, and governance.
- Optimization plane: asynchronous trace ingestion, synthesis, grading, candidate generation, evaluation, shadow analysis, promotion, and rollback.
- Data plane: durable stores for domain packs, manifests, traces, datasets, benchmark suites, artifacts, lineage, releases, and monitors.

The serving plane remains the current OpenClaw runtime and channel infrastructure.

## Required artifact model

The implementation must support first-class serializable artifacts for:

- `NicheProgram`
- `DomainPack`
- `RunTrace`
- `EvalCase`
- `EpisodeCase`
- `Artifact`
- `ArtifactRef`
- `LineageRef`
- `BaselineManifest`
- `CandidateManifest`
- `SourceAccessManifest`
- `CandidateRecipe`
- `GraderArtifact`
- `ArbitrationArtifact`
- `RewardArtifact`
- `CandidateRelease`
- `PromotedReleaseMonitor`
- `ReadinessReport`
- `DeterminismRuntimePolicy`

## Manifest and reproducibility policy

Benchmark claims are only valid when the full runtime stack is pinned.

Both baseline and candidate manifests must record the execution-affecting configuration, including:

- provider and planner runtime identity,
- model and snapshot or provider release metadata,
- API or protocol revision,
- sampling and retry policy,
- tool catalog and allowlist,
- retrieval and verifier configuration,
- grader-set version,
- benchmark suite and source-access manifests,
- token and context budgets,
- execution mode,
- candidate-specific Niche Stack components and candidate recipe.

Provider reality must be surfaced explicitly. Comparison reports must record `provider_metadata_quality`, and evidence with low-quality provider metadata must be marked as reduced-reproducibility evidence instead of being presented as exact replay truth.

## Benchmark protocol

NicheClaw treats evaluation as an experiment, not a dashboard.

Supported benchmark modes:

- `offline_gold`
- `offline_shadow`
- `live_shadow`
- `live_canary`

The experimental unit is a paired case: same task, same allowed tools, same source access, same planner runtime family, one baseline arm, and one candidate arm.

Required outputs include:

- per-case score,
- hard-fail flag,
- latency,
- cost,
- verifier outcome,
- grader version,
- confidence-interval summary,
- stratified summaries by task family,
- contamination-audit summary.

Default benchmark policy for promotion-eligible MVP runs:

- at least 100 held-out cases unless explicitly marked low-data experimental,
- at least 3 task families when the niche supports them,
- paired delta reporting with bootstrap confidence intervals,
- no early stopping because results merely look favorable,
- lower confidence bound above zero for the primary metric,
- preferred lift margin that matches release policy,
- controlled hard-fail, latency, and cost regressions.

For long-running workflows, promotion is invalid unless the candidate wins on both:

- atomic benchmark sets,
- episode benchmark sets.

Benchmark results are invalid when manifests are incomplete, suite or grader versions drift mid-run, contamination rules are violated, or source access differs across arms.

## RunTrace and determinism policy

`RunTrace` is a durable record of one live or offline run and must be rich enough to replay or explain benchmark evidence.

Trace policy requires:

- manifest-bound version references,
- benchmark arm and case references when applicable,
- phase timestamps,
- planner, action, tool, verifier, and final-output records,
- evidence bundle references,
- random seed and determinism notes,
- explicit `replayability_status`,
- wall-clock metadata,
- runtime snapshot or environment references where needed.

Replayability must distinguish:

- `replayable`
- `partially_replayable`
- `non_replayable`

Benchmark traces must be replayable or carry an explicit justification for reduced replayability.

Gold and shadow benchmarks must prefer frozen or snapshotted sources. Live APIs are disallowed for gold promotion-gating runs unless the suite is explicitly marked as live-variance evidence that does not gate promotion.

## Rights, contamination, and data governance

NicheClaw credibility depends on strong data-zone separation and derivative-rights handling.

Data zones:

- `train`
- `dev`
- `gold_eval`
- `hidden_eval`
- `shadow_only`
- `quarantined`

Hard rules:

- `gold_eval` data never enters training artifacts.
- `hidden_eval` data is never exposed to candidate-recipe construction.
- `shadow_only` live traces stay embargoed until reuse is permitted.
- contaminated artifacts cannot be promoted until rebuilt.

Every ingested source and trace must carry rights and policy metadata, including:

- `rights_to_store`
- `rights_to_train`
- `rights_to_benchmark`
- `rights_to_derive`
- `rights_to_distill`
- `rights_to_generate_synthetic_from`
- retention,
- redaction,
- PII status,
- provenance status

Derived artifacts inherit the most restrictive rights status in their lineage unless a stronger explicit authorization record exists.

## Graders, verifier packs, and reward governance

Graders are governed artifacts, not invisible truth machines.

Promotion-gating grader policy requires:

- typed grader artifacts,
- calibration against curated suites,
- recorded SME agreement and disagreement clusters,
- version pinning in manifests,
- no silent scorer changes in historical reports.

Grader arbitration must be explicit and support governed conflict handling. Promotion cycles must include SME-reviewed sampling to detect grader drift.

Verifier packs are promotion-relevant only when they improve net benchmark quality while keeping false-veto and operational-cost regressions within policy.

Reward artifacts, when used, are governed like graders: lineage, calibration evidence, version pinning, and documented failure modes are mandatory.

## Readiness and release policy

Before specialization begins, NicheClaw must emit a readiness decision:

- `ready`
- `ready_with_warnings`
- `not_ready`

Readiness must score source quality, source coverage, contradiction rate, freshness, rights sufficiency, task observability, benchmarkability, success measurability, and tool availability.

Hard blockers must prevent claims of niche readiness when rights are insufficient, benchmarkability is too weak, contradiction rates are too high, tooling is inadequate, or source coverage is too low.

Release policy must compare baseline and candidate evidence, enforce benchmark invalidation rules, and control movement through shadow, canary, promotion, and rollback.

Post-promotion monitoring must track drift in:

- task success,
- task-family performance,
- verifier false-veto rate,
- grader disagreement,
- source freshness,
- latency and cost,
- hard-fail rate.

## Semantic seams

The implementation must protect these seams with typed contracts and contract tests:

- Planner seam: after runtime resolution, before the run begins.
- Action seam: where planner intent becomes tool execution.
- Verifier seam: after candidate output exists, before user-visible delivery.
- Trace seam: where execution artifacts become durable records.
- Lifecycle seam: where optimization services observe typed phase events.

These are semantic seams. Tests should validate behavior and contracts, not line numbers.

## MVP definition

MVP must:

- ingest niche data and tools,
- compile a `DomainPack`,
- define a held-out benchmark suite,
- run a same-model OpenClaw baseline,
- produce at least one candidate Niche Stack,
- compare baseline and candidate,
- expose release evidence,
- promote only when the candidate wins under release policy.

MVP may defer:

- direct frontier fine-tuning,
- fully simulated gyms for every niche,
- continuous online optimization,
- multi-tenant hosted control planes.

The truthful MVP priority order is:

1. domain compilation
2. retrieval and evidence optimization
3. action-policy sidecar
4. verifier pack
5. optional distillation

## First pilot niche

The first pilot is repo, terminal, and CI work.

It is the best initial wedge because:

- OpenClaw already has strong workspace and tool primitives,
- traces are easy to capture and grade,
- failure modes are concrete,
- benchmarks can be built from real tasks,
- same-model improvement is easier to prove than in subjective niches.

## Implementation roadmap

- Phase 0: schemas, trace store, run metadata, benchmark-mode plumbing, and the initial `src/niche/` namespace.
- Phase 1: domain compiler plus baseline benchmark lab.
- Phase 2: action mediation, verifier packs, candidate comparison, shadowing, and release policy.
- Phase 3: distillation and artifact learning.
- Phase 4: provider-native tuning support where honest and possible, plus drift-aware continuous optimization planning.

## Immediate implementation handoff

The next truthful build step is not prompt tuning.

It is:

1. establish the in-repo PRD and architecture anchors,
2. define the serializable NicheClaw schemas,
3. create the initial `src/niche/` namespace,
4. add durable run traces,
5. implement a same-model benchmark runner before any tuning claims are made.
