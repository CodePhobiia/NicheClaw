# NicheClaw PRD v3

## Document status

- Version: v3
- Product: NicheClaw
- Base: source-level OpenClaw fork
- Audience: product, architecture, and implementation planning
- Intent: define a real specialization framework that improves agent performance in a niche and proves the lift with benchmarks
- Canonical role: strategy PRD
- Engineering companion: `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`
- Stability patch companion: `NICHECLAW_PRD_V3_1A_PATCH.md`

---

## 0. Executive decision

NicheClaw should not be built as "OpenClaw plus better prompts."

It should be built as a source-level OpenClaw fork that keeps OpenClaw's serving plane and adds a new optimization plane. The product is a specialization framework that:

1. compiles a niche into structured domain artifacts,
2. captures and grades real execution traces,
3. trains or adapts the strongest set of niche artifacts the chosen model stack supports,
4. benchmarks the resulting candidate against a same-model baseline,
5. and only promotes the candidate when it wins under explicit release policy.

That is the line between a real product and a prompt pack.

---

## 1. Hard truth from the codebase audit

OpenClaw is already a strong serving runtime. It is not yet a specialization platform.

### What OpenClaw already gives NicheClaw

- A mature serving loop for CLI, gateway, and channel-driven agent runs.
- Durable session storage and transcript persistence.
- A real tool/runtime model, not a toy chat wrapper.
- Plugin, hook, service, and context-engine extension seams.
- Memory, retrieval, diagnostics, usage analytics, and a control UI.

### What OpenClaw does not yet give NicheClaw

- A durable `RunTrace` model that represents one run as a benchmarkable artifact.
- A `DomainPack` or equivalent compiled niche artifact.
- A benchmark registry, eval corpus, grader registry, or candidate comparison engine.
- A promotion engine for baseline -> candidate -> shadow -> canary -> production.
- A first-class planner/action/verifier lifecycle in core.
- A training orchestration layer for distillation, sidecar policy learning, or provider-native tuning.

### Codebase verdict

OpenClaw is production-ready as a serving substrate for NicheClaw.

OpenClaw is pre-MVP for the optimization-plane responsibilities NicheClaw needs.

---

## 2. Audit of PRD v2

PRD v2 gets the big idea right, but it is still incomplete in the exact places that determine whether NicheClaw becomes real.

### What v2 gets right

- It correctly rejects "prompt tuning disguised as product."
- It correctly identifies the need for a serving loop and an optimization loop.
- It correctly centers same-model benchmark lift as the proof of value.
- It correctly proposes a planner / action / verifier split.
- It correctly treats failures as training data.
- It correctly allows multiple specialization lanes instead of assuming one fine-tuning API.

### What v2 still lacks

- A precise definition of what "training" means when the frontier runtime model itself is closed and not directly tunable.
- A benchmark protocol strong enough to resist leakage, overfitting, and cherry-picking.
- An operator workflow for turning raw niche data into approved deployment artifacts.
- A concrete source-level patch map into the current OpenClaw runtime.
- A truth-based MVP definition that can be built without pretending direct model weight tuning always exists.
- Explicit artifact types and lineage rules for datasets, traces, models, verifiers, and releases.
- Clear promotion thresholds and rollback policy.
- A practical implementation plan that starts inside the current repo instead of prematurely splitting into many packages.

### Main correction in v3

NicheClaw will define the deployed object as a **Niche Stack**, not just a tuned model.

The Niche Stack can include:

- a frontier planner model,
- an action policy,
- a domain pack,
- retrieval and reranking sidecars,
- verifier packs,
- candidate prompts and policies,
- and optionally a distilled or fine-tuned student model.

This lets NicheClaw be real even when direct tuning of the chosen frontier runtime is impossible.

---

## 3. Product definition

### One-sentence definition

NicheClaw is a source-level OpenClaw fork that compiles a niche into a deployable, benchmarked Niche Stack and promotes it only when it outperforms a same-model general-agent baseline.

### External promise

"Choose a niche, connect your data and tools, choose your runtime model, and NicheClaw will build and validate a specialized version of that agent before it goes live."

### Internal definition

NicheClaw = OpenClaw serving runtime + Domain Compiler + Trace Store + Benchmark Lab + Artifact Registry + Action/Verifier sidecars + Release Engine + Optimization Orchestrator.

---

## 4. Product thesis

### Core thesis

A niche agent is only real if it is measurably better on held-out niche tasks than a general agent running under the same runtime conditions.

### Architectural thesis

The unit of specialization is not only the model weights. The unit of specialization is the whole Niche Stack.

### Operational thesis

The product must make specialization repeatable, not bespoke. If every niche still requires manual expert engineering, the framework has failed.

---

## 5. Non-goals

NicheClaw is not:

- a prompt optimizer,
- a skill-library business dressed up as training,
- a generic RAG layer,
- a guarantee that every selected frontier model can be directly fine-tuned,
- a claim that benchmark wins exist without held-out evidence,
- or an autonomy product for high-risk domains by default.

---

## 6. Users and jobs to be done

### Primary user: Operator / Builder

They want to stand up a specialized agent for a repeatable workflow and need measurable proof that it beats the generic baseline.

### Secondary user: Reviewer / SME

They want to inspect traces, grade outputs, approve promotions, and understand why a candidate won or failed.

### End user

They want better outputs on niche work. They do not care whether the lift came from model weights, a tool policy, or a verifier as long as it is real.

---

## 7. The central product object: the Niche Stack

The deployed product artifact is the **Niche Stack**.

### Niche Stack contents

- `planner_runtime`: the live frontier or open-weight model used for planning and synthesis.
- `domain_pack`: the compiled domain representation.
- `action_policy`: the execution policy that converts planner intent into valid tool actions.
- `retrieval_stack`: retriever, reranker, exemplar selector, and evidence packing policy.
- `verifier_pack`: grounding, policy, format, and constraint validators.
- `benchmark_suite`: immutable eval cases and graders used to compare baseline and candidates.
- `release_policy`: thresholds, approvals, budgets, and rollback conditions.
- `optional_student_models`: distilled or fine-tuned components where supported.

### Why this matters

This makes NicheClaw honest. If the runtime model cannot be weight-tuned, the system can still learn through the surrounding stack and still prove lift.

---

## 8. What "training" means in NicheClaw

NicheClaw must use the strongest valid specialization path supported by the selected stack.

### Lane 1: System specialization

Always available. Train or optimize the surrounding system:

- domain compilation,
- retrieval,
- reranking,
- exemplar selection,
- tool selection and argument policy,
- repair policy,
- verifier behavior,
- routing,
- confidence calibration.

### Lane 2: Distillation

Use a frontier teacher to generate trajectories, preferences, repairs, and grader signals, then distill into smaller policies or student models.

### Lane 3: Provider-native model customization

Use provider-native fine-tuning or model-optimization paths when the chosen model family exposes them and the data/rights/supporting infrastructure are sufficient.

### Lane 4: Prompt/policy assets

Prompt assets still matter, but they are auxiliary. They are not the primary proof of value.

### Product truth

NicheClaw claims whole-system specialization lift, not necessarily direct weight updates on the frontier planner.

---

## 9. Codebase-grounded architecture

NicheClaw should keep OpenClaw's current serving plane and add a new control and optimization plane.

### 9.1 Serving plane

This remains the live OpenClaw runtime:

- gateway ingress in `src/gateway/server-methods/agent.ts`,
- route/session resolution in `src/commands/agent.ts` and `src/routing/resolve-route.ts`,
- embedded execution in `src/agents/pi-embedded-runner/run.ts`,
- per-attempt tool/model execution in `src/agents/pi-embedded-runner/run/attempt.ts`,
- tool streaming in `src/agents/pi-embedded-subscribe.ts`,
- final payload shaping in `src/auto-reply/reply/agent-runner.ts`.

### 9.2 Control plane

New NicheClaw control surfaces:

- niche creation,
- ingestion configuration,
- benchmark management,
- artifact inspection,
- candidate comparison,
- release approvals,
- governance and rights controls.

### 9.3 Optimization plane

New asynchronous services:

- trace ingestion,
- task synthesis,
- dataset curation,
- grader execution,
- distillation/fine-tuning jobs,
- action/verifier training,
- candidate evaluation,
- shadow analysis,
- promotion and rollback.

### 9.4 Data plane

New durable stores:

- domain pack store,
- run trace store,
- dataset registry,
- benchmark registry,
- artifact registry,
- release registry.

---

## 10. Source-level patch map into OpenClaw

NicheClaw should not fork blindly. It should patch specific seams.

### Patch A: planner seam

Insert planner-stage policy before the actual run is launched.

Use these seams:

- `src/commands/agent.ts:683-728`
- `src/auto-reply/reply/get-reply-run.ts:270-530`
- `src/agents/pi-embedded-runner/run.ts:308-360`

Purpose:

- domain routing,
- benchmark-mode routing,
- plan-template selection,
- candidate stack selection,
- run metadata registration.

### Patch B: action mediation seam

Introduce a mediated action layer between planner output and raw tool execution.

Use these seams:

- `src/agents/pi-embedded-runner/run/attempt.ts:853-904`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- `src/agents/session-tool-result-guard-wrapper.ts:34-71`

Purpose:

- validate tool selection,
- enforce contracts,
- run repair policies,
- score step quality,
- capture structured action proposals and execution outcomes.

### Patch C: verifier seam

Introduce verifier gating before final output is emitted to the user.

Use these seams:

- `src/auto-reply/reply/agent-runner.ts:488-703`
- `src/commands/agent/delivery.ts`
- `src/auto-reply/reply/dispatch-from-config.ts:501-589`

Purpose:

- grounding checks,
- constraint validation,
- output-format enforcement,
- hallucination/unsupported-claim veto,
- escalation to retry or human approval.

### Patch D: durable run-trace seam

OpenClaw already has session transcripts, cache traces, and usage analytics. NicheClaw must unify them into a durable run object.

Use these seams:

- `src/config/sessions/transcript.ts`
- `src/agents/cache-trace.ts`
- `src/infra/session-cost-usage.ts`
- `src/gateway/server-methods/usage.ts`

Purpose:

- persist run graphs,
- connect step-level events to benchmark outcomes,
- support lineage and replay.

### Patch E: lifecycle seam

OpenClaw hooks are broad, but they are not yet enough for true specialization governance.

Use and extend:

- `src/plugins/types.ts:321-345`
- `src/plugins/hooks.ts`

Add new core phases such as:

- `planner_proposed`
- `action_proposed`
- `action_validated`
- `verifier_decision`
- `run_trace_persisted`
- `benchmark_case_started`
- `benchmark_case_finished`
- `candidate_promoted`

---

## 11. Build strategy inside this repo

Do not start by creating a large package explosion.

### v1 implementation layout

Start in `src/niche/` with stable interfaces:

- `src/niche/domain/`
- `src/niche/traces/`
- `src/niche/benchmark/`
- `src/niche/release/`
- `src/niche/optimizer/`
- `src/niche/verifier/`
- `src/niche/action-policy/`

### Why

OpenClaw today is a mostly single-package runtime with extensions. NicheClaw should stabilize interfaces in-place first, then extract packages only after the boundaries are proven.

---

## 12. Core artifacts and schemas

### 12.1 NicheProgram

The operator-defined object that says what is being specialized.

Required fields:

- `niche_program_id`
- `name`
- `objective`
- `risk_class`
- `runtime_stack`
- `allowed_tools`
- `allowed_sources`
- `success_metrics`
- `rights_and_data_policy`

### 12.2 DomainPack

The compiled representation of the niche.

Required fields:

- `domain_pack_id`
- `niche_program_id`
- `version`
- `ontology`
- `task_taxonomy`
- `terminology_map`
- `constraints`
- `tool_contracts`
- `evidence_source_registry`
- `failure_taxonomy`
- `verifier_defaults`
- `benchmark_seed_specs`

### 12.3 RunTrace

The durable graph of one live or offline run.

Required fields:

- `trace_id`
- `run_id`
- `niche_program_id`
- `domain_pack_id`
- `mode` (`baseline`, `candidate`, `shadow`, `benchmark`, `live`)
- `session_ref`
- `planner_inputs`
- `planner_outputs`
- `action_proposals`
- `tool_calls`
- `observations`
- `verifier_decisions`
- `final_output`
- `usage`
- `latency`
- `cost`
- `failure_labels`
- `artifact_refs`

### 12.4 EvalCase

The immutable benchmark case.

Required fields:

- `eval_case_id`
- `suite_id`
- `split`
- `task_family`
- `input`
- `allowed_tools`
- `allowed_sources`
- `grader_spec`
- `pass_conditions`
- `hard_fail_conditions`
- `difficulty`
- `seed`

### 12.5 Artifact

A versioned specialization artifact.

Required fields:

- `artifact_id`
- `artifact_type`
- `producer`
- `source_trace_refs`
- `dataset_refs`
- `metrics`
- `created_at`
- `lineage`

### 12.6 CandidateRelease

The release unit that composes a Niche Stack candidate.

Required fields:

- `candidate_release_id`
- `niche_program_id`
- `baseline_release_id`
- `stack_manifest`
- `benchmark_results`
- `shadow_results`
- `decision`
- `decision_reason`
- `approved_by`
- `rollback_target`

---

## 13. Niche Compiler

The Niche Compiler is not a document chunker. It is the system that turns raw operator inputs into a machine-usable domain.

### Inputs

- documents,
- websites,
- repos,
- logs,
- datasets,
- tool schemas,
- past task traces,
- human examples,
- domain constraints.

### Outputs

- ontology,
- task families,
- evidence classes,
- failure taxonomy,
- tool contract registry,
- verifier defaults,
- benchmark seed cases,
- synthesis prompts for teacher rollouts.

### Why it matters

Without this step, NicheClaw collapses into RAG and cannot systematically learn task structure or failure patterns.

---

## 14. Benchmark Lab

Benchmark Lab is a product surface, not an internal script directory.

### Benchmark policy

The default comparison is:

- same provider,
- same runtime model,
- same tool budget,
- same source access,
- baseline OpenClaw stack versus candidate NicheClaw stack.

### Benchmark categories

- task success,
- tool selection accuracy,
- argument validity,
- evidence grounding,
- recovery quality,
- calibration,
- latency,
- cost,
- hard-fail rate.

### Grader types

- rule-based graders,
- structured output validators,
- trace graders,
- expert-review graders,
- pairwise preference graders.

### Data-split policy

Benchmark suites must partition by source, workflow family, and time so training data cannot trivially leak into eval.

### Default promotion thresholds

The starting policy for MVP should be:

- at least 100 held-out eval cases,
- primary score lift >= 15%, or >= 10% with statistically clear win and no material hard-fail regression,
- hard-fail regression <= 2 percentage points,
- p95 latency regression <= 25% unless operator opts into a quality-heavy mode,
- cost regression <= 40% unless justified by large quality gain,
- successful shadow run on real traffic before full promotion.

These are defaults, not immutable laws.

---

## 15. Niche Gym

Niche Gym is where trajectories become trainable.

### Purpose

- simulate realistic tool interactions,
- create recovery scenarios,
- generate teacher traces,
- expose partial observability and failure states,
- enable step-level grading.

### Forms

- repo / terminal / CI gym,
- support triage gym,
- research and synthesis gym,
- CRM or workflow gym,
- analysis pipeline gym.

### Product requirement

Not every niche needs a full simulator at first. MVP may start with semi-real replay environments plus tool sandboxes.

---

## 16. Operator workflow

### Stage 1: define niche

Operator declares:

- objective,
- target workflows,
- acceptable risk,
- runtime stack,
- required tools and sources,
- success criteria.

### Stage 2: ingest and compile

NicheClaw compiles inputs into a DomainPack and shows:

- ontology,
- tool mappings,
- benchmark seeds,
- failure taxonomy,
- rights and redaction warnings.

### Stage 3: benchmark baseline

Run the vanilla same-model OpenClaw stack against the benchmark suite.

### Stage 4: generate candidates

Run sidecar training, distillation, retrieval tuning, verifier training, or provider-native tuning where supported.

### Stage 5: compare and shadow

Evaluate candidate against baseline, then shadow live traffic if the benchmark result is good enough.

### Stage 6: promote or reject

Candidate becomes live only if it passes benchmark and shadow policies.

---

## 17. Why NicheClaw requires some core patches

Plugins and hooks can implement a lot, but not the whole product.

### Hooks are enough for

- adding tools,
- collecting telemetry,
- prompt/model steering,
- transcript filtering,
- background services,
- provider adapters,
- domain-specific verifiers running as optional layers.

### Hooks are not enough for

- a first-class durable run-trace lifecycle,
- a new planner/action/verifier state machine,
- final-output veto and structured retry semantics as a core invariant,
- benchmark-mode execution with canonical trace capture,
- release promotion as a first-class runtime concept.

### Product implication

NicheClaw should use existing plugin seams aggressively, but it must also patch core runtime paths where specialization needs stronger guarantees than extension hooks can provide.

---

## 18. MVP definition

The MVP is the smallest truthful version of NicheClaw.

### MVP must do all of this

- ingest niche data and tools,
- compile a DomainPack,
- define a held-out benchmark suite,
- run a same-model OpenClaw baseline,
- produce at least one candidate Niche Stack,
- compare baseline and candidate on the benchmark suite,
- expose the results and promote only if the candidate wins.

### MVP may defer

- direct frontier model fine-tuning,
- full simulator-grade gyms for every niche,
- continuous online optimization,
- multi-tenant hosted control planes.

### MVP specialization path

For truthfulness and speed, MVP should prioritize:

1. domain compilation,
2. retrieval and evidence optimization,
3. action-policy sidecar,
4. verifier pack,
5. optional distillation.

That is enough to prove real lift without pretending every frontier runtime can be fine-tuned.

---

## 19. Recommended first beachhead niche

Do not start with the hardest regulated niche.

### Best pilot characteristics

- repeated workflows,
- observable tool use,
- abundant traces,
- measurable success,
- moderate safety risk,
- high value from better execution discipline.

### Recommended first pilot

A repo / terminal / CI niche is the strongest first proof:

- OpenClaw already has strong coding, tool, and workspace primitives.
- Traces are easy to capture and grade.
- Failure modes are concrete.
- Benchmarks can be built from real tasks.
- Improvement is easier to prove than in subjective or high-risk domains.

Support triage is the second-strongest candidate.

---

## 20. Implementation roadmap

### Phase 0: instrumentation and schemas

- add `NicheProgram`, `DomainPack`, `RunTrace`, `EvalCase`, `CandidateRelease` schemas,
- implement a trace store,
- wire run metadata into embedded runs and final delivery,
- expose a hidden benchmark mode.

### Phase 1: DomainPack and baseline benchmark lab

- build ingestion and compiler pipeline,
- build benchmark suite registry,
- build baseline execution and score reporting,
- reuse existing usage and transcript analytics UI where possible.

### Phase 2: action and verifier specialization

- implement action mediation,
- implement verifier packs,
- implement candidate comparison,
- add shadow execution and release policy.

### Phase 3: distillation and artifact learning

- add teacher rollout pipelines,
- add action-policy training,
- add verifier training,
- add optional student-model distillation.

### Phase 4: provider-native tuning and continuous optimization

- integrate provider-native tuning where supported,
- add recurring retraining and drift detection,
- add automated candidate generation and approval workflows.

---

## 21. Success metrics

### Product metrics

- time to first benchmarked niche stack,
- percent of niches that achieve measurable lift,
- operator hours saved per niche,
- percentage of candidates rejected before deployment due to benchmark failure.

### Runtime metrics

- task success,
- tool correctness,
- evidence precision,
- unsupported-claim rate,
- recovery success,
- verifier veto rate,
- p95 latency,
- cost per task.

### Scientific honesty metrics

- same-model baseline adherence,
- eval leakage rate,
- benchmark-to-shadow correlation,
- false-win rate,
- regression detection speed.

---

## 22. Main risks

### Risk 1: fake lift

The candidate looks specialized but only overfits the benchmark.

Mitigation:

- immutable held-out evals,
- hidden shadow tasks,
- source and time-based split discipline.

### Risk 2: closed-model illusion

The team confuses "using a frontier model" with "being able to tune it."

Mitigation:

- treat weight tuning as optional,
- define success at the Niche Stack level,
- make training-lane selection explicit in the control plane.

### Risk 3: operational complexity

Too many artifacts become unmanageable.

Mitigation:

- artifact registry,
- lineage requirements,
- candidate manifests,
- strict release policy.

### Risk 4: weak niche data

Poor source quality leads to poor specialization.

Mitigation:

- compiler diagnostics,
- source scoring,
- benchmark sanity checks,
- operator warnings before training begins.

---

## 23. Why this is a real product and not prompt engineering

NicheClaw is real if all of the following are true:

- the niche becomes a compiled artifact,
- traces become durable learning objects,
- candidates are benchmarked against a same-model baseline,
- deployment is gated by a release engine,
- and the measured improvement survives hold-out and shadow evaluation.

If those conditions are not met, NicheClaw is just prompt engineering with better branding.

---

## 24. Immediate next implementation step

The next build step after this PRD is not "make better prompts."

It is:

1. define the actual TypeScript schemas for `NicheProgram`, `DomainPack`, `RunTrace`, `EvalCase`, `Artifact`, and `CandidateRelease`,
2. add a minimal `src/niche/` skeleton,
3. patch the runtime to emit durable run traces,
4. and implement a same-model benchmark runner before any tuning claims are made.

That is the correct handoff from product strategy to system architecture.

---

## 25. References

### Codebase references

- `src/commands/agent.ts`
- `src/gateway/server-methods/agent.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-subscribe.ts`
- `src/plugins/types.ts`
- `src/plugins/hooks.ts`
- `src/context-engine/types.ts`
- `src/context-engine/legacy.ts`
- `src/memory/manager.ts`
- `src/infra/session-cost-usage.ts`
- `src/gateway/server-methods/usage.ts`
- `docs/concepts/architecture.md`
- `docs/concepts/memory.md`
- `docs/help/testing.md`

### External references

- OpenAI model optimization guide: https://platform.openai.com/docs/guides/model-optimization
- OpenAI evals design cookbook: https://cookbook.openai.com/examples/evaluation/use-cases/bulk-experimentation
- OpenAI graders and trace grading cookbook: https://cookbook.openai.com/examples/agents_sdk/evaluate_agents
