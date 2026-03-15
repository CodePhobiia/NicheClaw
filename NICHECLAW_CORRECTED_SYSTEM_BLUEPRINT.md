# NicheClaw Corrected System Blueprint

## Document status

- Product: NicheClaw
- Role: corrected end-to-end system design
- Intent: define the minimum verified path from the current partial implementation to a fully wired, production-ready NicheClaw inside OpenClaw
- Basis: repo reality, code-only inference, approved NicheClaw documents

---

## 0. Executive summary

This document corrects an earlier over-broad architecture proposal.

The repo does **not** yet prove that NicheClaw needs a fully event-sourced platform, a content-addressed artifact operating system, or a multi-role workflow engine on day one.

What the repo **does** prove is that NicheClaw is missing a set of critical **loop closures**:

1. a first-class runtime/deploy object,
2. a surfaced compile/readiness flow,
3. real lifecycle and run-trace capture,
4. automatic manifest building,
5. live benchmark execution,
6. release actuation plus monitor service,
7. optimization executors,
8. and surfaced gateway/UI integration.

Those are the minimum systems required to transform NicheClaw from a governed CLI/runtime subsystem into a real product embedded inside OpenClaw.

This blueprint prioritizes those minimum systems first.

---

## 1. What this document corrects

The previous broad design was directionally strong, but it mixed:

- **must-have loop closures**
  with
- **larger platform bets**

too early.

This corrected version applies the following rules:

1. prefer loop closure over platform maximalism,
2. prefer extending proven OpenClaw seams over inventing parallel stacks,
3. prefer automatic artifact production over operator-supplied JSON,
4. prefer runtime-enforced guarantees over documentation- or schema-only guarantees,
5. prefer incremental productization inside OpenClaw over a disconnected NicheClaw product shell.

---

## 2. Ground truth from the current repo

The implementation reality today is:

- OpenClaw is the dominant shipped product surface.
- NicheClaw is a real subsystem with meaningful code.
- NicheClaw is strongest in:
  - schemas,
  - stores,
  - benchmark scoring,
  - release-policy computation,
  - runtime seed preparation,
  - verifier gating for prepared runs,
  - optimization planning.
- NicheClaw is weakest in:
  - surfaced authoring,
  - live execution loops,
  - release actuation,
  - monitoring services,
  - and user-facing product integration.

That means the next step is not more conceptual expansion.
It is operational closure.

---

## 3. Design principles

### 3.1 Build inside OpenClaw, not beside it

NicheClaw should become a first-class subsystem inside the existing OpenClaw gateway, UI, session, and agent model.

Why:

- OpenClaw already owns the actual shipped surface.
- Routing, sessions, delivery, paired devices, observability, and control UI already exist.
- A parallel product shell would increase drift and integration cost.

### 3.2 Extend existing policy and routing machinery

NicheClaw should extend:

- `src/agents/tool-policy-pipeline.ts`
- `src/agents/pi-tools.policy.ts`
- session/routing state
- agent execution seams

instead of building disconnected policy or deployment stacks.

Why:

- The repo already has strong tool-policy, routing, and session plumbing.
- Parallel policy systems create inconsistency and blast radius.

### 3.3 Treat artifacts as runtime inputs, not just governance nouns

Schemas, manifests, and stores are necessary but insufficient.
Each must become part of a closed runtime loop.

Why:

- The current gap is not lack of nouns.
- The current gap is lack of connected loops.

### 3.4 Productize the loop, not just the math

Benchmark scoring, invalidation logic, and release policy are useful, but not enough until they are connected to execution, promotion, and monitoring.

Why:

- The repo already has real scoring logic.
- What it lacks is real end-to-end execution and traffic consequence.

### 3.5 Delay big platform bets until loop closure is real

The following are valuable, but not minimum prerequisites:

- a fully event-sourced `RunGraph` platform,
- a full content-addressed Artifact OS,
- a complete gym continuum,
- a multi-role workflow engine.

Why:

- The repo does not yet prove these are the smallest necessary next steps.
- We should not expand the architecture before the product loop actually closes.

---

## 4. End-to-end target state

The minimum real product loop should become:

1. operator creates a Niche Program,
2. operator ingests sources and tools,
3. system compiles a `DomainPack`,
4. system runs readiness gating,
5. system builds a real `BaselineManifest`,
6. system generates a `CandidateRecipe`,
7. optimization executors produce real candidate artifacts,
8. benchmark fabric executes baseline and candidate under the same deterministic envelope,
9. verifier/grader/reviewer policy resolves conflicts,
10. release controller actuates shadow/canary/live/rollback states,
11. monitor service watches promoted stacks,
12. optimization loop plans and executes refreshes from governed live evidence.

Anything less than this is not yet full NicheClaw.

---

## 5. Core system design

Each section below covers:

- the gap,
- the proposed fix,
- how the fix works,
- why it will work,
- why it elevates the product.

### System 1: `ActiveNicheStack` runtime binding

#### Gap

The intended central product object, the Niche Stack, does not yet exist as a first-class runtime/deploy object. The repo currently gets closest through `CandidateRelease.stack_manifest`, but that is still too indirect.

#### Proposed fix

Introduce a first-class runtime binding object: `ActiveNicheStack`.

#### How the fix works

`ActiveNicheStack` is attached to the running OpenClaw execution context and contains:

- `active_stack_id`
- `niche_program_id`
- `baseline_manifest_id`
- `candidate_manifest_id` when relevant
- `domain_pack_id`
- `source_access_manifest_id`
- `action_policy_id`
- `verifier_pack_id`
- `retrieval_stack_id`
- `release_mode` (`baseline`, `shadow`, `canary`, `live`)
- `determinism_policy_id`
- `benchmark_context_id` when relevant

It is resolved and carried through:

- session state,
- route resolution,
- agent execution,
- final delivery,
- trace persistence.

#### Why this decision

Without a runtime-bound stack identity, NicheClaw remains artifact-centric rather than execution-centric.

#### Why it will work

OpenClaw already resolves per-run session, route, model, and delivery context. Adding one more resolved runtime identity is a natural extension of the existing execution model.

#### Why this takes the product to the next level

NicheClaw becomes the thing actually running, not just the thing being described.

---

### System 2: Niche authoring, ingest, compile, and readiness flow

#### Gap

The Domain Compiler and readiness gate are real code, but they are not surfaced as a closed operator loop. The CLI and runtime still expect operators to hand-supply artifacts that the product itself should create.

#### Proposed fix

Build a real authoring pipeline:

- `niche create`
- `niche ingest`
- `niche compile`
- `niche readiness`

plus matching gateway methods and later UI surfaces.

#### How the fix works

The operator:

1. creates a Niche Program,
2. uploads or points to sources,
3. assigns tools and constraints,
4. triggers compile,
5. receives:
   - normalized source records,
   - `DomainPack`,
   - `ReadinessReport`,
   - benchmark seed drafts,
   - source access policy.

All outputs are written into the niche stores automatically.

#### Why this decision

This is the clearest currently missing loop in the repo.

#### Why it will work

The compiler and readiness gate already exist. The missing pieces are orchestration, persistence, and product surface.

#### Why this takes the product to the next level

NicheClaw starts producing the key artifacts itself instead of treating them as expert-supplied prerequisites.

---

### System 3: Real lifecycle capture and trustworthy run traces

#### Gap

Planner capture is synthetic, lifecycle events are under-realized, and trace persistence is strongest only for prepared seeded runs.

#### Proposed fix

Capture real lifecycle events from the actual OpenClaw runtime and persist them into trace artifacts.

#### How the fix works

Instrument the actual seams:

- planner seam:
  - `src/commands/agent.ts`
  - `src/auto-reply/reply/get-reply-run.ts`
  - `src/agents/pi-embedded-runner/run.ts`
- action seam:
  - `src/agents/pi-tools.before-tool-call.ts`
  - tool handlers and result subscribers
- verifier seam:
  - `src/auto-reply/reply/agent-runner.ts`
  - `src/commands/agent/delivery.ts`

Persist real event data:

- planner input
- planner output
- action proposals
- tool attempts
- retries/repairs
- verifier decisions
- final emitted payloads
- timing/cost/usage

#### Why this decision

The current synthetic planner summaries weaken benchmark and release credibility.

#### Why it will work

The real execution path already funnels through a small number of high-leverage files. We do not need a huge new runtime to begin capturing real lifecycle data.

#### Why this takes the product to the next level

Benchmarking, attribution, replay, and release decisions become grounded in real execution instead of derived metadata.

---

### System 4: Automatic manifest builder

#### Gap

Baseline and candidate manifests are still too operator-supplied.

#### Proposed fix

Create automatic manifest builders driven by actual runtime state and niche state.

#### How the fix works

For baseline and candidate runs, the builder captures:

- provider/model information
- provider metadata quality
- API revision
- tool catalog version
- retrieval configuration
- verifier pack version
- source access manifest
- determinism policy
- suite hash
- fixture version
- environment snapshot metadata

and materializes:

- `BaselineManifest`
- `CandidateManifest`

without requiring manual authoring.

#### Why this decision

Same-model benchmarking is only trustworthy if manifests reflect actual runtime state.

#### Why it will work

The runtime already knows this information; it is just not yet normalized into canonical manifests.

#### Why this takes the product to the next level

Manifest correctness stops being aspirational and becomes mechanically enforced.

---

### System 5: Benchmark execution fabric

#### Gap

The benchmark system mostly scores supplied execution bundles rather than executing the comparison loop itself.

#### Proposed fix

Build a benchmark execution fabric that runs baseline and candidate arms directly.

#### How the fix works

For each atomic or episode case:

1. load the benchmark suite and determinism policy,
2. restore source snapshot / fixture state,
3. execute baseline run,
4. execute candidate run,
5. persist both traces,
6. compute paired deltas,
7. apply invalidation rules.

This fabric supports:

- `offline_gold`
- `offline_shadow`
- `live_shadow`
- `live_canary`

under explicit policy.

#### Why this decision

This is the single most important gap in benchmark credibility.

#### Why it will work

The scoring logic, invalidation logic, episode harness, and pilot seed material already exist. The missing piece is the executor that produces the evidence.

#### Why this takes the product to the next level

NicheClaw becomes a real evaluation engine instead of a bundle checker.

---

### System 6: Productized Niche Gym for the first wedge

#### Gap

The current repo/CI pilot is real but too synthetic and too test-centric to count as a true product loop.

#### Proposed fix

Productize the existing repo/CI gym as the first real benchmark environment.

#### How the fix works

Turn the current gym into an operator-usable environment with:

- fixture packs,
- deterministic environment snapshots,
- benchmark suite binding,
- run invocation through benchmark fabric,
- artifact persistence,
- inspectable episode traces.

Do **not** require a three-mode gym platform immediately.
Start with:

- deterministic fixture mode,
- and one realistic repo/terminal/CI execution mode.

#### Why this decision

The repo proves we need a more realistic wedge, but does not yet prove we need a full multi-mode gym platform on day one.

#### Why it will work

The current pilot already has meaningful seed logic and environment modeling.

#### Why this takes the product to the next level

The first benchmark wedge becomes operator-real instead of mostly synthetic.

---

### System 7: Action Policy extension on top of existing OpenClaw tool policy

#### Gap

The current action policy is only partly real and risks becoming a parallel policy system.

#### Proposed fix

Implement NicheClaw action policy as an extension layer over existing OpenClaw tool-policy machinery.

#### How the fix works

Extend the current policy stack with:

- niche-aware contract guard,
- candidate tool ranking,
- argument validation,
- repair and retry execution,
- per-step attribution data.

Use the existing policy pipeline as the enforcement substrate, and add NicheClaw-specific decisions as policy overlays rather than separate infrastructure.

#### Why this decision

This is the least risky and most correct architectural move for the current repo.

#### Why it will work

The existing tool-policy and runtime tool call seams are already authoritative. NicheClaw should specialize them, not compete with them.

#### Why this takes the product to the next level

The action layer becomes a real specialization engine and remains coherent with OpenClaw internals.

---

### System 8: Verifier operations and reviewer workflow

#### Gap

The verifier pack is real but narrow. Grader/reviewer/SME operations are not yet a complete product loop.

#### Proposed fix

Create a verifier operations layer with structured review workflows.

#### How the fix works

Add:

- verifier findings queue,
- grader calibration review flow,
- SME adjudication flow,
- false-veto and override review,
- release-blocking review states.

This does not require a full enterprise workflow engine at first. It requires a real operational loop for verifier and grader trust.

#### Why this decision

Governance in the repo is currently stronger in data models than in user-operable flow.

#### Why it will work

The registry, calibration, arbitration, and verifier schemas already exist. They just need to become part of a real operating loop.

#### Why this takes the product to the next level

Governance becomes something operators can act on, not just something stored in files.

---

### System 9: Governance enforcement plane

#### Gap

Rights propagation, contamination, lineage, and revocation are strongest today as metadata and planning, weaker as connected runtime enforcement.

#### Proposed fix

Build a governance enforcement plane on top of current stores and lineage edges.

#### How the fix works

Every source, dataset, trace, recipe, verifier artifact, benchmark suite, and release is checked at critical transitions:

- ingest
- compile
- benchmark execution
- optimization planning
- optimization execution
- release
- refresh planning

Revocation traverses lineage and emits explicit invalidation/purge plans.

#### Why this decision

The repo already has the right metadata model and partial revocation logic. The missing part is enforcing that graph during real system transitions.

#### Why it will work

We can build this on top of the current file-backed stores and lineage relationships before considering a larger artifact operating system.

#### Why this takes the product to the next level

The strongest governance claims become operationally real.

---

### System 10: Release controller and traffic states

#### Gap

Release policy computes decisions, but nothing currently actuates shadow, canary, live, or rollback behavior.

#### Proposed fix

Build a release controller integrated into OpenClaw routing and execution.

#### How the fix works

The controller manages:

- baseline state
- shadow mirroring
- canary routing
- live activation
- rollback target selection

It binds the active niche stack to agent/session/channel execution and controls traffic behavior explicitly.

#### Why this decision

This is a core missing loop closure.

#### Why it will work

OpenClaw already has strong routing, session, and delivery control. The controller can extend these mechanisms rather than reinventing deployment.

#### Why this takes the product to the next level

Promotion becomes a real operational state transition rather than a CLI recommendation.

---

### System 11: Monitor daemon and drift service

#### Gap

The promoted monitor is not yet a running monitoring service.

#### Proposed fix

Add a monitor daemon that continuously evaluates promoted stacks.

#### How the fix works

The daemon:

- runs shadow rechecks on cadence,
- evaluates drift windows,
- applies hysteresis,
- respects rollback cooldowns,
- tracks freshness decay,
- emits refresh plans or rollback triggers.

#### Why this decision

Without this, promotion is still not a closed loop.

#### Why it will work

The repo already has monitor schemas and policy logic. It lacks a running service that turns them into ongoing observations.

#### Why this takes the product to the next level

NicheClaw gains post-promotion accountability instead of one-shot release evaluation.

---

### System 12: Optimization executors

#### Gap

The optimization plane plans work but does not execute it.

#### Proposed fix

Add background executors for:

- candidate generation,
- teacher rollouts,
- verifier refresh,
- data synthesis,
- benchmark prep,
- candidate refresh,
- provider-native tuning when valid.

#### How the fix works

The orchestrator writes typed jobs.
Workers consume them, enforce rights/contamination policy, and write artifacts back to the current stores with lineage and calibration metadata.

#### Why this decision

The repo clearly proves that planning-only is not enough.

#### Why it will work

Most of the job planning and artifact models already exist. Execution is the missing side of the system.

#### Why this takes the product to the next level

NicheClaw becomes an actual optimization system.

---

### System 13: Provider-native tuning lane adapters

#### Gap

Provider-native tuning is capability-gated in theory, but still planner-only.

#### Proposed fix

Add real provider-native tuning adapters where support exists, while preserving truthful fallback behavior elsewhere.

#### How the fix works

For supported providers:

- submit tuning jobs,
- persist tuning artifacts,
- record provider metadata quality,
- attach resulting artifacts to candidate recipes/releases.

For unsupported providers:

- force fallback to sidecar or distillation lanes.

#### Why this decision

The docs require multi-lane specialization, and the repo already recognizes tuning capability as a first-class concern.

#### Why it will work

Capability gating already exists. The executor layer plus provider adapters close the lane.

#### Why this takes the product to the next level

NicheClaw can honestly support the strongest valid specialization path per stack.

---

### System 14: Surfaced NicheClaw product plane in gateway and UI

#### Gap

NicheClaw remains CLI-only and invisible in the primary OpenClaw product surfaces.

#### Proposed fix

Add first-class gateway methods and UI views for NicheClaw.

#### How the fix works

Expose:

- niche programs
- source sets
- compile status
- readiness reports
- manifests
- benchmark runs
- candidate releases
- monitors
- artifact lineage
- reviewer queues

inside the existing OpenClaw control plane.

#### Why this decision

The repo reality is clear: OpenClaw owns the surfaced product. If NicheClaw is meant to become real, it must inhabit those surfaces.

#### Why it will work

The gateway API and Control UI already serve operator workflows. NicheClaw belongs there.

#### Why this takes the product to the next level

NicheClaw becomes visible, operable, and productized.

---

### System 15: Replace documentation-coupled bootstrap with state-coupled bootstrap

#### Gap

Niche bootstrap is too coupled to narrative docs and file anchors.

#### Proposed fix

Make typed state the runtime bootstrap source of truth.

#### How the fix works

`niche init` creates:

- the niche program,
- state roots,
- baseline runtime defaults,
- governance defaults.

`PRD.md` and `ARCHITECTURE.md` become generated support artifacts, not runtime prerequisites.

#### Why this decision

The current dependency on narrative anchors is a maturity smell.

#### Why it will work

Typed state is already the direction of the niche subsystem. This simply finishes the move.

#### Why this takes the product to the next level

NicheClaw becomes operationally self-contained.

---

## 6. Gap-to-system closure map

This section explicitly covers every major gap identified by the code-reality analysis.

| Gap                                                           | Closing system(s)            |
| ------------------------------------------------------------- | ---------------------------- |
| Niche Stack not first-class                                   | System 1                     |
| Compiler/readiness not surfaced                               | Systems 2, 15                |
| Planner capture synthetic                                     | System 3                     |
| Trace persistence seed-only                                   | Systems 1, 3                 |
| Manifests operator-supplied                                   | System 4                     |
| Benchmarking is result-ingestion                              | System 5                     |
| Episode evaluation too synthetic                              | Systems 5, 6                 |
| Grader workflow not operational                               | System 8                     |
| Action policy mostly post-hoc                                 | System 7                     |
| Verifier narrow and seeded                                    | Systems 8, 10                |
| Release engine not actuating traffic                          | System 10                    |
| Post-promotion monitor not running                            | System 11                    |
| Rights/contamination/revocation weakly enforced operationally | System 9                     |
| Optimization plane plans only                                 | System 12                    |
| Provider-native tuning lane planner-only                      | Systems 12, 13               |
| Continuous optimization planner-only                          | Systems 11, 12               |
| CLI asks for artifacts product should create                  | Systems 2, 4, 12, 15         |
| No NicheClaw gateway/UI surface                               | System 14                    |
| Pilot wedge not operator-real enough                          | System 6                     |
| Serving and optimization planes only partially bridged        | Systems 1, 3, 10, 12         |
| Lifecycle contracts not truly emitted                         | System 3                     |
| Docs ahead of surfaced product loop                           | Systems 2, 5, 10, 11, 14, 15 |

---

## 7. Deliberately deferred larger bets

The following are valuable, but are not required before NicheClaw becomes real:

### 7.1 Full event-sourced `RunGraph` platform

Useful later if lifecycle capture grows large and replay complexity rises.

### 7.2 Full content-addressed Artifact OS

Useful later if store scale, deduplication, and enterprise governance needs exceed the current file-backed registry model.

### 7.3 Full gym continuum

Useful later when multiple niche domains require simulation, replay, and sandbox live environments in one unified abstraction.

### 7.4 Full multi-role workflow engine

Useful later when reviewer, SME, approver, and operator flows become complex enough to justify a dedicated workflow system.

These are not rejected.
They are intentionally not treated as day-one minimums.

---

## 8. Implementation order

### Phase 1: Core loop closure

Build first:

1. `ActiveNicheStack` runtime binding
2. surfaced compile/readiness flow
3. real lifecycle/run-trace capture
4. automatic manifest builder
5. benchmark execution fabric

### Phase 2: Product consequence

Build next:

6. release controller
7. monitor daemon
8. optimization executors
9. provider-native tuning adapters where valid

### Phase 3: Productization

Build next:

10. surfaced gateway/UI integration
11. productized repo/CI gym wedge
12. verifier/reviewer operations
13. state-based bootstrap

### Phase 4: Later-stage expansion

Only after the loops are real:

14. full artifact operating system
15. richer gym modes
16. multi-role workflow engine
17. larger event platform if justified

---

## 9. Final verdict

The corrected answer is:

NicheClaw does **not** need more abstract product language.
It needs to convert its strong schemas, stores, and policy logic into **closed operational loops**.

The minimum verified path is to:

- bind stacks at runtime,
- surface compile and readiness,
- capture real lifecycle traces,
- build manifests automatically,
- execute real benchmarks,
- actuate release and monitoring,
- execute optimization jobs,
- and surface NicheClaw in OpenClaw’s gateway and UI.

That is the path that takes NicheClaw from:

- a real but partial subsystem

to:

- a real, wired, production-ready specialization product fully ingrained into OpenClaw.
