# NicheClaw Architecture

## Document status

- Product: NicheClaw
- Role: canonical in-repo architecture anchor
- Status: active
- Based on:
  - `PRD.md`
  - `NICHECLAW_PRD_V3.md`
  - `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`
  - `NICHECLAW_PRD_V3_1A_PATCH.md`

## Architectural stance

NicheClaw is an overlay on the existing OpenClaw fork.

We are not building a separate application, separate runtime, or separate serving binary for MVP. The architectural goal is to preserve OpenClaw's live serving behavior and layer specialization, evaluation, and governed release on top of it.

The consequence is simple:

- OpenClaw remains the serving substrate.
- NicheClaw adds control-plane, optimization-plane, and data-plane capabilities around that substrate.
- Runtime patches happen only at the semantic seams where specialization needs stronger guarantees than current hooks alone provide.

## System planes

## Serving plane

This is the existing OpenClaw runtime that already accepts work, resolves routes, executes model and tool loops, and delivers outputs.

Current repo anchors:

- `src/gateway/server-methods/agent.ts`
- `src/commands/agent.ts`
- `src/routing/resolve-route.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-subscribe.ts`
- `src/auto-reply/reply/agent-runner.ts`

Serving-plane rule:

- NicheClaw must preserve current OpenClaw behavior unless NicheClaw mode is explicitly active.

## Control plane

The control plane is the operator-facing layer that defines and governs a niche.

Primary responsibilities:

- niche initialization,
- source-ingest configuration,
- benchmark-suite management,
- manifest and artifact inspection,
- candidate comparison,
- release decisions,
- governance and rights visibility.

MVP control-plane bias:

- CLI first,
- runtime first,
- no required web UI for initial delivery.

## Optimization plane

The optimization plane is asynchronous. It does not replace the serving loop; it learns from it.

Primary responsibilities:

- trace ingestion,
- dataset curation,
- candidate-recipe generation,
- benchmark execution,
- grader calibration,
- teacher-rollout planning,
- distillation or provider-native tuning planning where supported,
- shadow analysis,
- promotion and rollback planning,
- drift-triggered refresh planning.

## Data plane

The data plane stores the durable artifacts that make the product honest and reproducible.

Primary data classes:

- programs,
- domain packs,
- manifests,
- benchmark suites and runs,
- traces and replay bundles,
- artifacts and lineage,
- releases and monitors,
- grader and reward governance artifacts,
- optimizer job metadata.

MVP storage stance:

- file-backed stores are acceptable,
- interfaces must be stable and migration-friendly,
- silent overwrite behavior is not acceptable.

## Semantic seams

NicheClaw is allowed to patch OpenClaw only at stable semantic seams.

## Planner seam

Definition:

- the point after route, session, and runtime resolution and before the actual run begins

Current repo anchors:

- `src/commands/agent.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/agents/pi-embedded-runner/run.ts`

Why this seam exists:

- bind run metadata to manifests,
- select baseline or candidate stack,
- select benchmark mode,
- register run context before execution begins.

## Action seam

Definition:

- the point where planner intent becomes an executable tool invocation

Current repo anchors:

- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`
- `src/agents/session-tool-result-guard-wrapper.ts`

Why this seam exists:

- run contract guards,
- rank candidate tools,
- attach structured `ActionProposal` records,
- apply repair or retry policy,
- capture step-level execution evidence.

## Verifier seam

Definition:

- the point after the tool and model loop has produced a candidate result and before it becomes user-visible

Current repo anchors:

- `src/auto-reply/reply/agent-runner.ts`
- `src/commands/agent/delivery.ts`
- `src/auto-reply/reply/dispatch-from-config.ts`

Why this seam exists:

- apply grounding checks,
- enforce domain constraints,
- veto unsupported claims,
- request repair,
- escalate or block unsafe final outputs.

## Trace seam

Definition:

- the point where one run's execution artifacts become a durable, queryable record

Current repo anchors:

- `src/config/sessions/transcript.ts`
- `src/agents/cache-trace.ts`
- `src/infra/session-cost-usage.ts`
- `src/gateway/server-methods/usage.ts`

Why this seam exists:

- unify transcripts, cache traces, usage, and benchmark evidence into a durable `RunTrace`,
- make comparisons auditable,
- make replay and lineage possible.

## Lifecycle seam

Definition:

- the point where typed events let optimization services observe or govern runtime phases

Current repo anchors:

- `src/plugins/types.ts`
- `src/plugins/hooks.ts`

Target lifecycle events include:

- `planner_proposed`
- `action_proposed`
- `action_validated`
- `verifier_decision`
- `run_trace_persisted`
- `benchmark_case_started`
- `benchmark_case_finished`
- `candidate_promoted`

Engineering rule:

- seam behavior is protected by contract tests, not by line-number coupling.

## Planned source layout

NicheClaw work lands in-place under `src/niche/` until boundaries are proven.

Planned namespace:

```text
src/niche/
  action-policy/
  benchmark/
  contracts/
  domain/
  gym/
  optimizer/
  pilots/
  release/
  runtime/
  schema/
  store/
  verifier/
  constants.ts
  index.ts
```

Sprint 0.1 only creates the import-safe namespace anchors. Later sprints fill in the subdirectories.

## Stable state layout

The canonical mutable root for NicheClaw data is:

```text
$OPENCLAW_STATE_DIR/niche/
```

Planned top-level directories under that root:

- `programs`
- `domain-packs`
- `manifests`
- `benchmark-suites`
- `benchmark-runs`
- `traces`
- `replay-bundles`
- `artifacts`
- `lineage`
- `releases`
- `monitors`
- `graders`
- `jobs`

These names are kept as pure string constants so later modules can share them without importing runtime-heavy path logic.

## Pilot niche: repo, terminal, and CI

The first benchmarked pilot is repo, terminal, and CI work.

Why this pilot is first:

- it fits the current OpenClaw substrate,
- it already uses real tool execution,
- traces are concrete and easy to grade,
- long-horizon workflows can be modeled as episode cases,
- benchmarkable success and failure conditions already exist.

Representative pilot task families:

- repo navigation and code understanding,
- tool selection and argument discipline,
- repair loops after tool or test failures,
- multi-step terminal and CI workflows,
- evidence-grounded coding and verification tasks.

Pilot success condition:

- NicheClaw must produce a governed candidate that beats a same-model OpenClaw baseline on held-out repo, terminal, and CI tasks before promotion is allowed.

## Build sequence

The current implementation order is:

1. architecture anchors and namespace setup
2. serializable schemas
3. file-backed stores and seam contracts
4. benchmark lab and grader governance
5. domain compiler and readiness gate
6. runtime action mediation and trace capture
7. verifier gate and release engine
8. optimizer and niche gym
9. CLI control plane and pilot niche
10. hardening and PRD compliance audit

## Key commands

Current commands used during NicheClaw bring-up:

- `pnpm exec vitest run test/niche/docs-anchor.test.ts`
- `pnpm format:check`
- `pnpm build:strict-smoke`
- `pnpm openclaw agent`
- `pnpm openclaw gateway run`

Planned NicheClaw CLI surface, scheduled for later sprints:

- `openclaw niche init`
- `openclaw niche benchmark`
- `openclaw niche optimize`
- `openclaw niche release`
- `openclaw niche inspect`
- `openclaw niche compare`

Those planned commands are part of the approved sprint source of truth, but they are not available until the later CLI sprints land.

## Non-negotiable architectural rules

- Preserve OpenClaw behavior outside explicit NicheClaw paths.
- Treat benchmark claims as experimental claims backed by manifests and replayable traces.
- Never claim tuning support that a provider does not actually expose.
- Never let gold or hidden evaluation data leak into training artifacts.
- Never let release promotion bypass verifier, benchmark, lineage, or rights policy.
- Keep NicheClaw boundaries stable in-repo before splitting packages.
