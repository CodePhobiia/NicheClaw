# NicheClaw Implementation Source of Truth

## Document status

- Product: NicheClaw
- Role: canonical engineering execution plan and dependency-aware implementation source of truth
- Status: active
- Date locked: 2026-03-13
- Scope: implement NicheClaw inside this OpenClaw fork, not beside it
- Supersedes for execution sequencing:
  - `NICHECLAW_SPRINT_SOURCE_OF_TRUTH.md`
- Complements, but does not replace:
  - `NICHECLAW_CORRECTED_SYSTEM_BLUEPRINT.md`
  - `NICHECLAW_PRD_V3.md`
  - `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`
  - `NICHECLAW_PRD_V3_1A_PATCH.md`
  - `PRD.md`
  - `ARCHITECTURE.md`

---

## 1. Purpose

This document is the single source of truth for turning the current partial NicheClaw implementation into a real surfaced product loop inside OpenClaw.

It exists to answer, in implementation order:

1. what is already real in this repo,
2. what is still missing,
3. what must be built first,
4. what can wait,
5. what proves each stage is actually done.

This is an execution plan, not a product vision document.

---

## 2. Repo-grounded reality

### 2.1 What is already real

The repo already contains substantial NicheClaw code under `src/niche/` and `test/niche/`, including:

- TypeBox-backed schemas for niche artifacts, manifests, runtime seeds, traces, governance, and release objects
- file-backed stores for manifests, traces, lineage, replay bundles, benchmark runs, and readiness reports
- benchmark scoring, invalidation, arbitration, calibration, and fixture hashing
- domain ingest, compiler, readiness, and rights-propagation logic
- runtime seed preparation, seeded run registration, verifier gating, lifecycle emission, and trace persistence
- release policy evaluation, promotion result assembly, promoted monitor assessment, and lineage-aware rights revocation
- optimizer planning, reward governance, tuning capability gating, and continuous optimization planning
- CLI commands for `init`, `prepare-run`, `run`, `benchmark`, `optimize`, `release`, `inspect`, and `compare`

### 2.2 What is still missing

The product loop is still open in the following repo-proven areas:

- no first-class runtime-wide active niche stack resolution model
- no surfaced operator loop for create/ingest/compile/readiness that replaces hand-authored downstream JSON
- no promotion-authoritative benchmark executor that runs both arms through the real runtime path
- no release controller that actually changes routing/traffic state
- no running monitor daemon/service for promoted stacks
- no optimizer executor that runs planned jobs for real
- no NicheClaw gateway methods
- no NicheClaw Control UI or native app surface

### 2.3 Current shipped surface

Current shipped NicheClaw behavior is still mostly CLI- and artifact-driven:

- `openclaw niche prepare-run` and `openclaw niche run` are real seeded-runtime flows
- `openclaw niche benchmark` still operates on typed execution inputs rather than orchestrating live baseline/candidate runs itself
- `openclaw niche optimize` still plans jobs without executing them
- `openclaw niche release` computes release decisions but does not actuate traffic states
- `openclaw niche inspect` and `openclaw niche compare` are read-only governance helpers

### 2.4 Current branch health

As of 2026-03-13, the niche slice is mostly exercised but not fully green.

`pnpm test:niche` currently reports:

- 36 passing test files
- 3 failing test files

Current failures are concentrated in:

- `test/niche/store/manifest-artifact-store.test.ts`
- `test/niche/store/trace-lineage-store.test.ts`
- `test/niche/verifier/pack.test.ts`

This means contract stabilization is still the first implementation gate.

---

## 3. Locked implementation decisions

These decisions are now fixed unless explicitly revised.

### 3.1 Active promoted niche stack scope

Use a hybrid model.

- Canonical ownership: `agent`
- Effective activation surface: `session` and `route/channel/account` overrides

Runtime precedence:

1. `session override`
2. `route/channel/account override`
3. `agent default`

Storage implications:

- store promoted stack ownership on the agent
- store rollout overlays in route/channel/account policy state
- persist the effective resolved stack and resolution source on session/run-trace state

Rollback implications:

- rollback reverts the agent default
- rollback clears or remaps overlays tied to the failed stack
- traces must preserve the previously resolved stack identity for auditability

### 3.2 Live benchmark execution mode

Start synchronous-first, but behind a job-compatible runner contract.

- CLI and direct gateway-triggered runs execute synchronously first
- benchmark runs must still create durable benchmark-run records with status, timeout/cancel semantics, and result refs
- later worker/queue infrastructure must wrap the same runner instead of replacing it

### 3.3 First surfaced product UI stage

Build gateway API plus a minimal read-first Control UI extension.

Required first UI scope:

- Niche Programs
- DomainPack status
- readiness reports
- manifests
- benchmark runs
- candidate comparison
- release decisions
- promoted monitor state
- artifact lineage inspection

Minimal action scope:

- compile
- benchmark
- promote/reject
- inspect/compare

Keep CLI-first initially for:

- rich authoring
- bulk source editing
- advanced optimization planning
- low-level prepared-seed operations
- calibration administration beyond inspection

### 3.4 Prepared-seed support

Keep prepared-seed as a supported advanced/operator-facing interface and internal substrate.

Prepared-seed must remain:

- an advanced mode
- an internal executor substrate
- a deterministic low-level bridge between niche state and runtime execution

Prepared-seed must not remain:

- the primary product UX

Higher-level flows should compile down into it:

- compile -> manifest -> prepared seed -> run
- benchmark fabric -> prepared seed pairs -> execute
- release shadow/canary -> prepared execution context internally

---

## 4. Execution posture

### 4.1 Overall posture

- foundation-first due to coupling and runtime risk
- narrow MVP build
- staged platform build, not a greenfield rewrite

### 4.2 Non-negotiable rules

- build inside OpenClaw, not beside it
- extend existing OpenClaw routing, session, hook, policy, and gateway seams where possible
- treat benchmark claims as experimental claims backed by real runtime evidence
- do not present analysis-only or summary-only benchmark artifacts as release-authoritative evidence
- preserve OpenClaw behavior outside explicit NicheClaw paths
- do not front-load large platform bets before loop closure

### 4.3 Explicitly deferred larger bets

Do not pull these into the MVP-critical path unless later evidence proves they are required:

- full event-sourced `RunGraph` platform
- content-addressed Artifact OS
- full multi-mode Niche Gym continuum
- full multi-role workflow engine
- distributed worker fleet
- broad native-app NicheClaw productization

---

## 5. True MVP definition

The smallest truthful MVP is:

1. operator defines a repo/terminal/CI niche,
2. system ingests sources and compiles a `DomainPack`,
3. system runs and persists readiness,
4. system resolves a runtime-bound niche stack,
5. system generates baseline and candidate manifests from actual runtime state,
6. system executes baseline and candidate through the real runtime path,
7. system persists run traces, replay bundles, and benchmark result records,
8. system promotes only if the candidate wins under release policy,
9. system can bind promoted state back into OpenClaw runtime behavior,
10. system monitors promoted behavior and can trigger rollback,
11. operators can inspect the loop through gateway and minimal Control UI surfaces.

Anything less than this is still partial NicheClaw.

---

## 6. Workstreams

### WS-1. Contract and state stabilization

Objective:

- make the current niche schema/store/verifier contracts authoritative and green

In scope:

- manifest schema/store alignment
- trace schema/store alignment
- replay bundle schema/store alignment
- verifier decision serialization alignment
- niche-targeted test stability

Out of scope:

- new product surfaces
- new runtime behavior

Key deliverables:

- green contract-bearing niche tests
- explicit compatibility between schemas and persisted records

Verification:

- `pnpm test:niche`

Unlocks:

- every later workstream

### WS-2. Runtime binding and lifecycle capture

Objective:

- make NicheClaw a runtime-bound execution context, not only a file-driven subsystem

In scope:

- minimal active stack resolution
- binding into agent/session/run context
- planner/action/verifier/trace lifecycle capture from real runtime seams
- niche action policy overlay on top of existing policy machinery

Out of scope:

- distributed event infrastructure
- parallel policy platform

Key deliverables:

- resolved active niche stack context
- resolution-source persistence
- lifecycle events emitted from real run paths
- durable run-trace persistence grounded in actual runtime execution

Verification:

- seam contract tests
- runtime path tests
- non-niche regression tests

Unlocks:

- honest benchmark execution
- release actuation

### WS-3. Authoring, ingest, compile, readiness, and bootstrap

Objective:

- replace hand-authored artifact prerequisites with product-owned creation flows

In scope:

- niche creation
- source ingest
- compile orchestration
- readiness persistence
- bootstrap defaults

Out of scope:

- rich frontend authoring
- multi-tenant content management

Key deliverables:

- persisted `NicheProgram`
- normalized source records
- `DomainPack`
- `ReadinessReport`
- source-access policy state

Verification:

- CLI flow tests
- compile/readiness integration tests

Unlocks:

- manifest automation
- benchmark execution
- optimizer inputs

### WS-4. Manifest automation and live benchmark execution

Objective:

- make promotion-authoritative benchmark evidence come from live baseline/candidate execution

In scope:

- automatic baseline/candidate manifest building
- synchronous benchmark runner backed by the real runtime path
- atomic and episode execution
- trace/evidence/replay linkage
- benchmark-run persistence

Out of scope:

- worker-first benchmark orchestration
- cross-model experimentation as MVP-critical behavior

Key deliverables:

- manifest builder from actual runtime state
- synchronous benchmark executor
- promotable benchmark result records

Verification:

- benchmark integration tests
- replay and trace persistence tests
- pilot benchmark smoke runs

Unlocks:

- trustworthy release decisions

### WS-5. Release actuation, governance enforcement, and monitor service

Objective:

- turn release policy into runtime consequence and post-promotion accountability

In scope:

- agent-default promoted stack state
- route/channel/account overlays
- release-state persistence
- shadow/canary/live/rollback routing behavior
- monitor cadence and rollback triggers

Out of scope:

- enterprise approval workflow engine

Key deliverables:

- release controller
- monitor service
- rollback path

Verification:

- routing-state tests
- monitor assessment tests
- release lifecycle tests

Unlocks:

- real product consequence

### WS-6. Optimization execution and truthful tuning lanes

Objective:

- convert optimizer plans into executed jobs with governed artifact outputs

In scope:

- job persistence and execution state
- one real executable optimizer lane for MVP
- lineage-aware artifact writes
- truthful provider-native tuning adapters with explicit fallback

Out of scope:

- distributed workers
- broad provider coverage

Key deliverables:

- one executing optimizer job path
- persisted job status and results
- lineage-connected artifacts from executed work

Verification:

- optimizer execution tests
- governance and lineage tests

Unlocks:

- NicheClaw as a real optimization system

### WS-7. Gateway and Control UI surfacing

Objective:

- make NicheClaw visible and operable inside OpenClaw’s actual shipped product surfaces

In scope:

- gateway methods for niche state and actions
- minimal read-first Control UI views
- pilot validation flows

Out of scope:

- full standalone NicheClaw frontend
- native mobile product surfaces

Key deliverables:

- NicheClaw gateway API
- minimal Control UI surface
- operator-accessible pilot loop

Verification:

- gateway integration tests
- UI smoke tests
- end-to-end pilot walkthrough

Unlocks:

- first real surfaced product stage

---

## 7. Dependency and sequencing map

### 7.1 Critical path

1. WS-1 contract stabilization
2. WS-2 runtime binding and lifecycle capture
3. WS-3 authoring/compile/readiness loop
4. WS-4 manifest automation and live benchmark execution
5. WS-5 release actuation and monitor service
6. WS-7 gateway and Control UI surfacing
7. WS-6 optimizer execution

### 7.2 Why this order is correct

- benchmark honesty depends on runtime binding plus compile/readiness outputs
- release truth depends on honest benchmark evidence
- surfaced UI depends on trustworthy gateway and runtime consequence
- optimizer execution depends on lineage, governance, and release-quality evidence

### 7.3 Parallelizable work

Safe parallel work after WS-1:

- WS-2 runtime binding
- WS-3 authoring/compile/readiness

Safe parallel work after WS-4:

- read-first gateway contract design
- pilot asset refinement

### 7.4 Work that should not be parallelized early

Do not start these in earnest before prerequisites are done:

- release actuation before live benchmark evidence exists
- optimizer execution before governance and release state are enforceable
- Control UI work before gateway contracts and routing semantics stabilize
- worker-first benchmark infrastructure before synchronous runner truth is proven

---

## 8. Milestones

### MS-1. Stable niche contract surface

Goal:

- remove current schema/store/verifier drift and make niche contracts green

Includes:

- WS-1

Completion criteria:

- current failing niche store/verifier tests are fixed
- persisted manifest/trace/replay/verifier objects match schema expectations

Verification evidence:

- `pnpm test:niche`

Intentionally unfinished:

- no new runtime consequence
- no new gateway/UI surface

### MS-2. Runtime-bound niche execution

Goal:

- make niche identity and lifecycle real in the serving plane

Includes:

- WS-2
- runtime-facing parts of WS-3

Completion criteria:

- active niche stack resolves via precedence rules
- resolved stack source is persisted into session/run-trace state
- niche lifecycle data comes from actual run paths

Verification evidence:

- runtime seam tests
- lifecycle tests
- manual seeded-run smoke path

Intentionally unfinished:

- live benchmark executor
- release routing consequence

### MS-3. Honest compile-to-benchmark loop

Goal:

- make benchmark evidence promotion-authoritative

Includes:

- remaining WS-3
- WS-4

Completion criteria:

- create/ingest/compile/readiness loop produces system-owned artifacts
- manifests are built automatically from real runtime state
- benchmark runner executes baseline and candidate through the real runtime path

Verification evidence:

- benchmark integration tests
- persisted trace/replay/benchmark records
- pilot benchmark smoke flow

Intentionally unfinished:

- release routing actuation
- monitor service
- UI surfacing

### MS-4. Governed release loop

Goal:

- make promotion and rollback real OpenClaw runtime state transitions

Includes:

- WS-5

Completion criteria:

- agent default promoted stack is persisted
- route/channel/account overlays can target shadow/canary behavior
- rollback resets the agent default and remaps or clears overlays
- monitor service can trigger rollback decisions

Verification evidence:

- release routing tests
- monitor tests
- manual shadow/canary/rollback validation

Intentionally unfinished:

- optimizer workers
- broad UI polish

### MS-5. Surfaced MVP product loop

Goal:

- expose the first real NicheClaw operator loop inside OpenClaw

Includes:

- WS-7
- first executable slice of WS-6

Completion criteria:

- gateway methods exist for niche inspection and core actions
- minimal Control UI exists
- one real optimizer lane executes and persists governed outputs

Verification evidence:

- gateway tests
- UI smoke tests
- end-to-end pilot walkthrough

Intentionally unfinished:

- broad native surfaces
- workflow engine
- distributed workers

---

## 9. Concrete task backlog

### T-1. Fix current schema/store/verifier drift

Touches:

- `src/niche/schema/`
- `src/niche/store/`
- `src/niche/verifier/`
- `test/niche/store/`
- `test/niche/verifier/`

Acceptance:

- `pnpm test:niche` passes for current failing areas

### T-2. Add active niche stack resolution

Touches:

- `src/niche/runtime/`
- `src/commands/agent.ts`
- `src/commands/agent/delivery.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/gateway/server-methods/agent.ts`

Acceptance:

- agent default, route override, and session override all resolve correctly
- run traces persist resolved stack source

### T-3. Thread niche policy into core tool-policy seams

Touches:

- `src/agents/tool-policy-pipeline.ts`
- `src/agents/pi-tools.policy.ts`
- `src/niche/action-policy/`
- `src/agents/pi-embedded-runner/run/attempt.ts`

Acceptance:

- NicheClaw policy is an overlay on the existing policy substrate, not a separate policy stack

### T-4. Promote create/ingest/compile/readiness to first-class flows

Touches:

- `src/commands/niche/`
- `src/niche/domain/`
- `src/niche/store/`
- `src/cli/program/register.niche.ts`

Acceptance:

- operators can create a niche and produce system-owned downstream artifacts without hand-authoring all runtime JSON

### T-5. Build automatic manifest generation from real runtime state

Touches:

- `src/niche/runtime/`
- `src/niche/store/manifest-store.ts`
- `src/commands/agent.ts`
- `src/agents/pi-embedded-runner/run.ts`

Acceptance:

- benchmark and release flows can consume manifests produced from actual runtime state

### T-6. Replace offline bundle benchmarking with synchronous live execution

Touches:

- `src/niche/benchmark/`
- `src/commands/niche/benchmark.ts`
- `src/niche/runtime/`
- `src/niche/store/benchmark-run-store.ts`

Acceptance:

- promotion-authoritative benchmark records come from live runtime execution

### T-7. Add release state, routing actuation, and monitor service

Touches:

- `src/niche/release/`
- `src/commands/niche/release.ts`
- `src/commands/agent.ts`
- `src/gateway/server-methods/agent.ts`
- `src/gateway/server-methods/chat.ts`

Acceptance:

- promotion and rollback have real runtime consequence

### T-8. Execute one optimizer lane for real

Touches:

- `src/niche/optimizer/`
- `src/niche/store/`
- runtime service startup paths

Acceptance:

- one optimizer job type can execute, persist governed outputs, and be benchmarked

### T-9. Add gateway methods and minimal Control UI

Touches:

- `src/gateway/server-methods/`
- `ui/src/ui/navigation.ts`
- `ui/src/ui/app.ts`
- `ui/src/ui/views/`

Acceptance:

- operators can inspect and run the first real niche loop through OpenClaw surfaces without editing raw files

---

## 10. Verification and readiness gates

### 10.1 Contract gate

Must be true before runtime expansion:

- niche contract tests are green
- manifest, trace, replay, and verifier records serialize cleanly

### 10.2 Runtime gate

Must be true before live benchmark execution:

- active stack resolution exists
- lifecycle events are emitted from real runtime seams
- run traces persist actual runtime evidence

### 10.3 Benchmark gate

Must be true before release actuation:

- live benchmark runs execute both arms
- manifests are runtime-derived
- benchmark result records are durable and promotion-authoritative

### 10.4 Release gate

Must be true before optimizer execution or broad UI surfacing:

- promoted state changes runtime behavior explicitly
- rollback path is implemented
- monitor observations are durable and actionable

### 10.5 Surface gate

Must be true before calling NicheClaw a real surfaced product:

- gateway methods exist
- minimal Control UI exists
- repo/terminal/CI pilot can run end to end through surfaced operator paths

---

## 11. MVP vs deferred scope

### MVP-critical

- contract stabilization
- runtime binding with hybrid scope model
- authoring/compile/readiness loop
- automatic manifest generation
- synchronous live benchmark execution
- release controller and monitor service
- prepared-seed retained as advanced/internal substrate
- gateway API plus minimal read-first Control UI

### Deferred

- worker-first benchmark infrastructure
- distributed optimizer workers
- full reviewer workflow engine
- broad frontend-heavy NicheClaw application
- native mobile/macOS NicheClaw product surfaces
- prepared-seed deprecation

### Nice later, not now

- event-sourced run platform
- content-addressed artifact OS
- full gym continuum
- hosted multi-tenant control plane

---

## 12. Risks that still matter

### R-1. Benchmark honesty remains illusory

Mitigation:

- make live runtime execution the only promotion-authoritative benchmark path

### R-2. Runtime seam patches regress OpenClaw

Mitigation:

- gate all niche behavior behind explicit binding
- keep seam regression tests green

### R-3. Contract drift reappears

Mitigation:

- treat contract stabilization as a blocking layer
- add compatibility assertions where schemas are serialized to stores

### R-4. Release scope ambiguity leaks into multiple systems

Mitigation:

- keep agent as canonical anchor
- keep overlays secondary
- persist resolved scope source in every run

### R-5. Optimizer execution violates rights or contamination rules

Mitigation:

- enforce lineage and rights in executors, not only in planners

---

## 13. Remaining open questions

Only questions that still materially affect implementation remain here.

### OQ-1. Exact persistence location for agent default promoted stack state

Temporary assumption:

- keep it in niche-owned state with a small bridge into agent runtime resolution

Why it matters:

- affects release controller shape and gateway mutation paths

### OQ-2. First gateway mutation scope

Temporary assumption:

- expose inspect plus a narrow set of actions first: compile, benchmark, promote/reject

Why it matters:

- controls how early gateway and UI become critical-path

---

## 14. Final directive

If there is ever a conflict between:

- broad platform ambition
- and the shortest correct path to a real surfaced repo/terminal/CI specialization loop

choose the shorter correct path.

NicheClaw becomes real when OpenClaw can:

- resolve an active niche stack at runtime,
- compile and readiness-gate a niche,
- execute baseline and candidate honestly,
- promote with real consequence,
- monitor post-promotion behavior,
- and surface that loop through OpenClaw’s own gateway and Control UI.
