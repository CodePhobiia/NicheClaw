# NicheClaw Blindspot Remediation Design

## Document status

- Date: 2026-03-14
- Role: approved design for closing all six blindspots identified by the product inference audit
- Approach: spine-first — build the e2e spine, then make it accessible
- Prerequisite context: the audit report (pasted in conversation), NICHECLAW_IMPLEMENTATION_SOURCE_OF_TRUTH.md

## Blindspots being addressed

| ID   | Severity | Summary                                                    |
| ---- | -------- | ---------------------------------------------------------- |
| BS-1 | High     | NicheClaw requires manual JSON assembly for every step     |
| BS-2 | Medium   | No end-to-end integration test exercises the full workflow |
| BS-3 | High     | Two product identities coexist with unclear relationship   |
| BS-4 | Medium   | File-system persistence at scale                           |
| BS-5 | Medium   | Optimizer generates jobs but doesn't execute them          |
| BS-6 | Medium   | No NicheClaw UI                                            |

## Implementation order

1. BS-2 (e2e test) — proves the pipeline connects
2. BS-1 (guided creation) — makes the proven pipeline accessible
3. BS-5 (optimizer execution) — completes the optimization loop
4. BS-6 (Control UI) — surfaces real state visually
5. BS-3 (product identity) — resolves naming and entry points
6. BS-4 (persistence posture) — adds guardrails, defers migration

## Phase 1: E2E Integration Test (BS-2)

### What

A single test file that exercises the full NicheClaw pipeline: create program, compile domain, check readiness, prepare run seed, execute benchmark, evaluate release, actuate promotion, monitor, rollback. No mocks for store/schema layers. Mocks only for the AI provider.

### Location

`test/niche/e2e/full-pipeline.test.ts`

### What it proves

- Every store write from stage N is readable by stage N+1
- Schema types produced by compilation are valid inputs to benchmarking
- Benchmark results satisfy release policy evaluation
- Release actuation changes active stack state
- Rollback restores previous state
- Lifecycle events fire at every transition

### What it does not do

- Call real AI providers
- Test gateway or UI layers
- Cover every edge case (the 215+ unit tests do that)

### Design

The test constructs a minimal but schema-valid NicheProgram with one source, compiles it, prepares baseline + candidate manifests, runs a synthetic benchmark with a fake executor that returns fixed scores, evaluates release policy, actuates promotion, then runs a monitor cycle that triggers rollback. Every stage uses real store functions against a temp home directory.

One describe block, one it block, linear pipeline. ~300 lines.

## Phase 2: Guided Creation Flows (BS-1)

### What

A `niche quickstart` command that interactively walks the operator through the full pipeline in one session.

### How it works

1. Gather inputs interactively using `@clack/prompts`:
   - Program name, objective, risk class
   - AI provider + model (from existing model catalog)
   - Allowed tools (multi-select from available tools)
   - Source paths (operator points to local files/repos)
   - Success metric (what "better" means for this niche)

2. Generate all downstream artifacts automatically:
   - Construct and persist the NicheProgram
   - Normalize sources into SourceDescriptor objects
   - Call compileNicheProgramFlow to produce DomainPack + ReadinessReport
   - Generate starter BaselineManifest and CandidateManifest from compilation output + runtime state
   - Write a starter BenchmarkSuite with seed specs from the domain pack
   - Write a starter PromotedMonitorDefinition with default thresholds

3. Print summary and next-step instructions.

### Location

- `src/commands/niche/quickstart.ts` — command implementation
- `src/niche/domain/manifest-builder.ts` — automatic manifest generation from compilation + runtime state
- `src/cli/program/register.niche.ts` — register the new subcommand

### Key design choice

The quickstart generates real artifacts using the same code paths the e2e test proves work. Not a separate "simple mode" — an interactive frontend to the same pipeline.

### What it does not do

- Replace individual commands (those remain for power users)
- Run benchmarks or release automatically
- Build a full interactive TUI

## Phase 3: Optimizer Execution Completion (BS-5)

### What

A concrete default executor for `candidate_generation` that produces real artifacts without requiring the operator to write their own executor function.

### Location

- `src/niche/optimizer/candidate-generation-executor.ts` — concrete executor
- `src/commands/niche/optimize.ts` — add `--execute` flag

### How it works

- Takes a planned candidate_generation job with its CandidateRecipe
- Reads recipe input datasets from artifact store
- Produces output artifacts by applying recipe steps (deterministic artifact derivation for MVP — real provider-native tuning stays behind capability gate)
- Persists all produced artifacts via materializeOptimizerArtifact with lineage and rights propagation

### What it does not do

- Call provider fine-tuning APIs (deferred behind tuning capability gate)
- Execute teacher_rollout, verifier_refresh, or evaluation_preparation
- Distribute work to background workers

## Phase 4: Control UI Views (BS-6)

### What

A minimal read-first NicheClaw dashboard inside the existing Control UI.

### Views

1. **Niche Programs list** — table with name, risk class, readiness status
2. **Program detail** — definition, latest compilation, readiness dimensions, active stack binding
3. **Benchmark runs** — table with suite, case kind, mean delta, confidence interval, contamination status
4. **Active runtime state** — registered stacks, agent defaults, route overlays, release modes
5. **Release history** — promotion/rollback timeline from lifecycle events

### Actions (minimal)

- Rollback button on active stack view (calls niche.release.rollback gateway method)
- Refresh readiness link (directs to CLI command)

### Location

- `ui/src/ui/views/niche/` — one component per view
- `ui/src/ui/navigation.ts` — add NicheClaw nav section

### What it does not do

- Interactive program creation (CLI quickstart handles that)
- Benchmark execution from UI
- Full CRUD on any entity
- Become a standalone NicheClaw frontend

## Phase 5: Product Identity Resolution (BS-3)

### What

Naming, entry point, and documentation changes that make NicheClaw's identity clear.

### Changes

1. CLI alias: `openclaw nicheclaw` maps to `openclaw niche` subcommand tree
2. Control UI nav: label the dashboard section "NicheClaw" (not "Niche")
3. README: one paragraph describing the product relationship
4. Quickstart header: prints "NicheClaw — Governed AI Agent Specialization" at start

### What it does not do

- Rename the package from openclaw
- Create a separate CLI binary
- Rewrite docs or planning materials
- Change the src/niche/ directory name

## Phase 6: Persistence Scaling Posture (BS-4)

### What

No migration. Two guardrails that make the eventual migration safe and tell us when it's needed.

### Guardrail 1: Store access abstraction boundary

Doc comment on the store index barrel stating that store modules are the persistence boundary and callers must not assume file-system semantics. (The code already follows this pattern — this formalizes it.)

### Guardrail 2: Performance smoke test

One test in the e2e file that creates 200 artifacts + 200 lineage edges + 50 traces, then runs listing and traversal operations. Assert each completes under 5 seconds. Fails loudly when scale exceeds file-system comfort zone.

### What it does not do

- Migrate to SQLite/Postgres
- Add indexing or cleanup/GC
- Build a migration framework

## Dependencies

- Phase 1 has no dependencies (builds on existing code)
- Phase 2 depends on Phase 1 (quickstart follows the path the e2e test proved)
- Phase 3 is independent of Phase 2 (can parallelize)
- Phase 4 depends on gateway methods (already built)
- Phase 5 is independent (trivial, can be done anytime)
- Phase 6 is appended to Phase 1 (performance smoke test in the e2e file)

## Risks

- Phase 2 (quickstart) is the largest single piece of work due to interactive prompt handling and manifest generation logic
- Phase 4 (UI) requires understanding the existing ui/ architecture which hasn't been deeply explored yet
- Phase 3 (optimizer execution) produces artifacts that must satisfy the same governance chain benchmarking and release expect — the e2e test (Phase 1) should be extended to cover this path
