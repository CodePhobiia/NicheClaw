# NicheClaw Sprint Source of Truth

## PRD Ambiguities & Assumptions

- This sprint plan targets the existing OpenClaw fork in this repository, not a greenfield app.
- `NICHECLAW_PRD_V3.md`, `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`, and `NICHECLAW_PRD_V3_1A_PATCH.md` are the canonical product documents until Sprint 0.1 creates `PRD.md`.
- MVP is CLI-first and runtime-first. Web UI work is deferred until the core niche system, trace store, benchmark runner, and release engine work end to end.
- The first benchmarked pilot niche is repo / terminal / CI because it best matches the current OpenClaw substrate and has measurable tool-driven workflows.
- The first implementation should use stable interfaces under `src/niche/` and `test/niche/`, not a large package split.
- File-backed registries and replay bundles are acceptable for MVP as long as interfaces are production-ready and migration-friendly.

## PRD Extraction Summary

## Current Shipped Surface

- `openclaw niche prepare-run` and `openclaw niche run` are shipped readiness-gated seeded-runtime commands. They prepare and activate approved NicheClaw seeds; they are not placeholders and are not slated for deletion.
- `openclaw niche benchmark` currently summarizes typed execution bundle inputs into benchmark result records. Its JSON output carries `input_mode: "typed_execution_bundle"` so operators do not confuse it with end-to-end live runtime benchmarking.
- `openclaw niche release` and `openclaw niche compare` now expect benchmark result record JSON for policy-grade evidence. Summary-only benchmark JSON remains readable for limited inspection, but it is not promotion-authoritative.
- Follow-up note: a true end-to-end benchmark execute path that produces durable run-trace, replay-bundle, and evidence refs directly from live execution is still a future implementation step and is intentionally not in the current shipped scope.

### Functional requirements

- Introduce a first-class Niche Stack consisting of planner runtime, domain pack, action policy, retrieval stack, verifier pack, benchmark suite, release policy, and optional student models.
- Compile operator-defined niches into durable artifacts: `NicheProgram`, `DomainPack`, `RunTrace`, `EvalCase`, `Artifact`, `CandidateRelease`, manifests, policies, and monitors.
- Add a Domain Compiler, Benchmark Lab, Release Engine, Action Policy, Verifier Pack, and Optimization Orchestrator on top of OpenClaw's serving runtime.
- Support multi-lane specialization including sidecar optimization, distillation, provider-native tuning where available, and continuous optimization planning from governed live traces.
- Support atomic and episode benchmarks, same-model baseline vs candidate comparisons, shadow and canary modes, readiness gates, grader arbitration, and post-promotion monitoring.
- Provide CLI/operator control surfaces for niche initialization, benchmark execution, and release decisions.

### Non-functional requirements

- Claims of improvement must be benchmark-gated, reproducible, contamination-aware, and same-model honest.
- Runtime changes must preserve current OpenClaw behavior outside the new NicheClaw paths.
- All manifests, traces, and lineage objects must be replayable or explicitly marked otherwise.
- Benchmark evidence must surface provider metadata quality, suite hashes, fixture versions, and environment snapshots where reproducibility depends on them.
- Derived-data rights, grader drift, verifier false-veto rates, and reward-artifact governance must be enforced.
- Rights revocation must be able to invalidate downstream artifacts, candidate recipes, and promoted releases through lineage-aware purge planning.
- Semantic seams must be protected by contract tests rather than brittle line-number coupling.

### Tech stack constraints

- Use the existing TypeScript, pnpm, Vitest, and OpenClaw runtime architecture in this repo.
- Reuse existing session, transcript, memory, hook, and CLI patterns before inventing new abstractions.
- Prefer TypeBox-backed schemas for serializable niche artifacts so they can evolve into JSON schema later without rework.
- Use `scripts/committer` for commits, not manual `git add` / `git commit`.

### Data model entities

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
- `CandidateRecipe`
- `PromotedReleaseMonitor`
- `RewardArtifact`
- `ReadinessReport`

### User roles

- Operator / Builder
- Reviewer / SME
- End user

### Acceptance criteria

- A repo/terminal/CI pilot niche can be defined, compiled, benchmarked, compared against a same-model OpenClaw baseline, and promoted only if the candidate wins under release policy.
- The implementation must include durable traces, manifests, lineage, readiness gating, verifier gating, benchmark invalidation, and seam contract tests.

## Sprint Plan

| Sprint | Name                           | Prompts | Key Deliverables                                                                                                                    |
| ------ | ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Foundation & Architecture      | 0.1     | `PRD.md`, `ARCHITECTURE.md`, `src/niche/` skeleton, anchor tests                                                                    |
| 1      | Core Schemas                   | 1.1-1.3 | TypeBox schemas for niche artifacts, manifests, traces, governance, schema tests                                                    |
| 2      | Stores & Contracts             | 2.1-2.3 | Manifest/artifact/trace stores, replay bundles, seam contracts and tests                                                            |
| 3      | Benchmark Lab & Graders        | 3.1-3.3 | Atomic runner, episode runner, invalidation, arbitration, grader registry, suite hashing                                            |
| 4      | Domain Compiler & Readiness    | 4.1-4.2 | Source ingest, compiler v1, readiness gate, rights propagation                                                                      |
| 5      | Action Policy & Runtime Trace  | 5.1-5.3 | Guard/selector/repair layers, runtime mediator, tool trace capture                                                                  |
| 6      | Verifier, Release & Governance | 6.1-6.4 | Verifier pack, final-output gating, promotion policy, post-promotion monitor, revocation handling                                   |
| 7      | Optimization Plane & Niche Gym | 7.1-7.5 | Candidate recipes, data synthesis, teacher rollouts, gym harness, optimizer orchestration, tuning adapters, continuous optimization |
| 8      | Control Plane & Pilot          | 8.1-8.3 | CLI niche commands, repo/terminal/CI pilot domain pack and benchmark seeds, inspect/compare flows                                   |
| 9      | Production & Compliance        | 9.1-9.2 | Hardening, full PRD compliance audit, final verification                                                                            |

---

```markdown
**[Sprint 0.1: NicheClaw Architecture Anchor]**

**Context:** We are building inside an existing OpenClaw fork, not starting from an empty directory. The approved product documents are `NICHECLAW_PRD_V3.md`, `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`, and `NICHECLAW_PRD_V3_1A_PATCH.md`.

**Objective:** Create the canonical in-repo architecture and PRD anchors for NicheClaw, establish the initial `src/niche/` namespace, and add a small contract test that prevents these anchors from silently disappearing.

**Actionable Tasks:**

1. Read `NICHECLAW_PRD_V3.md`, `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`, and `NICHECLAW_PRD_V3_1A_PATCH.md` in full before making changes.
2. Create `PRD.md` in the repo root that consolidates the approved NicheClaw doc set into a single implementation-facing source of truth. It must explicitly state that it supersedes earlier drafts.
3. Create `ARCHITECTURE.md` in the repo root. It must document the NicheClaw overlay on OpenClaw, the planned `src/niche/` layout, the serving/control/optimization/data planes, the semantic seams, key commands, and the first repo/terminal/CI pilot.
4. Create `src/niche/constants.ts` with stable namespace constants and state-directory names that the rest of the implementation can import without circular dependencies.
5. Create `src/niche/index.ts` that exports the namespace constants and is safe to import from other modules immediately.
6. Create `test/niche/docs-anchor.test.ts` that verifies `PRD.md`, `ARCHITECTURE.md`, and `src/niche/index.ts` exist and that the exported namespace constants are non-empty.

**Strict Constraints:**

- Write 100% complete, production-ready code and docs. No placeholder comments, TODO markers, or empty scaffolding.
- Preserve existing OpenClaw behavior and file layout outside the scope of this prompt.
- Use TypeScript strict mode and existing repo patterns. Do not add dependencies.
- Do not modify release assets, mobile app code, or unrelated docs.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/docs-anchor.test.ts` and fix all failures.
2. Run `pnpm format:check` and fix all formatting issues in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify `PRD.md` and `ARCHITECTURE.md` both exist and are internally consistent with the approved NicheClaw docs.
5. Once all checks pass, run: `scripts/committer "docs(niche): add architecture and PRD anchors" PRD.md ARCHITECTURE.md src/niche/constants.ts src/niche/index.ts test/niche/docs-anchor.test.ts`
```

```markdown
**[Sprint 1.1: Niche Program & Domain Pack Schemas]**

**Context:** We are on Sprint 1 of 10. Sprint 0 established `PRD.md`, `ARCHITECTURE.md`, and the initial `src/niche/` namespace. Read `ARCHITECTURE.md` to ground your understanding of the repo structure and the NicheClaw architecture overlay.

**Objective:** Define the core serializable schemas and static types for `NicheProgram`, `DomainPack`, and shared schema primitives that every later niche subsystem will depend on.

**Actionable Tasks:**

1. Create `src/niche/schema/common.ts` with shared TypeBox schema utilities, string enums, timestamp/hash helpers, and reusable metadata fragments used by all niche artifacts.
2. Create `src/niche/schema/program.ts` with the full `NicheProgram` schema and exported static TypeScript type. Include fields for objective, risk class, runtime stack, allowed tools, allowed sources, success metrics, and rights/data policy.
3. Create `src/niche/schema/domain-pack.ts` with the full `DomainPack` schema and exported static TypeScript type. Include ontology, task taxonomy, terminology map, constraints, tool contracts, evidence source registry, failure taxonomy, and verifier defaults.
4. Create `src/niche/schema/index.ts` that exports the shared schema utilities plus the `NicheProgram` and `DomainPack` schema/type symbols.
5. Create `test/niche/schema/program-domain-pack.test.ts` covering required fields, enum constraints, nested object shape validity, and a real round-trip serialization example for both schemas.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Use TypeBox for serializable schemas and exported static types for compile-time safety.
- Keep field names aligned with `PRD.md`; do not invent extra product entities unless they are directly required to make the schemas consistent.
- Do not modify files outside the scope of this prompt unless fixing imports or exports in `src/niche/index.ts`.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/schema/program-domain-pack.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify `src/niche/schema/index.ts` exports all newly added schema/type symbols.
5. Once all checks pass, run: `scripts/committer "feat(niche-schema): add niche program and domain pack schemas" src/niche/schema/common.ts src/niche/schema/program.ts src/niche/schema/domain-pack.ts src/niche/schema/index.ts test/niche/schema/program-domain-pack.test.ts`
```

```markdown
**[Sprint 1.2: Benchmark, Manifest, and Readiness Schemas]**

**Context:** We are on Sprint 1 of 10. Sprint 1.1 created the shared schema foundation plus `NicheProgram` and `DomainPack`. Read `ARCHITECTURE.md` to ground your understanding of the intended benchmark and control-plane design.

**Objective:** Define the schemas that make same-model benchmarking, manifest pinning, determinism policy, episode support, and readiness gating enforceable.

**Actionable Tasks:**

1. Create `src/niche/schema/benchmark.ts` with schemas and static types for `EvalCase`, `EpisodeCase`, `DeterminismRuntimePolicy`, benchmark suite metadata, benchmark arm identifiers, and benchmark result summaries.
2. Create `src/niche/schema/manifests.ts` with schemas and types for `BaselineManifest`, `CandidateManifest`, and `SourceAccessManifest`, including provider-reality fields such as `provider_release_label`, `api_revision`, `capability_snapshot_at`, `routing_proxy_version`, `provider_metadata_quality`, and `provider_runtime_notes`.
3. Create `src/niche/schema/readiness.ts` with schemas and static types for `ReadinessReport`, dimension scores, hard blockers, warnings, and recommended next actions.
4. Update `src/niche/schema/index.ts` to export all benchmark, manifest, and readiness symbols.
5. Create `test/niche/schema/benchmark-manifests-readiness.test.ts` covering required fields, manifest invariants, episode-case shape, and readiness-report blocking semantics.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Keep manifest fields reproducibility-oriented and aligned with `PRD.md`, the annex, and the `v3.1a` patch.
- Include both atomic and episode benchmark support and a first-class `DeterminismRuntimePolicy`; do not collapse them into a single vague case type or leave determinism as prose-only metadata.
- Do not modify unrelated runtime or CLI files in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/schema/benchmark-manifests-readiness.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify `src/niche/schema/index.ts` exports all newly added symbols without duplicate names.
5. Once all checks pass, run: `scripts/committer "feat(niche-schema): add benchmark manifest and readiness schemas" src/niche/schema/benchmark.ts src/niche/schema/manifests.ts src/niche/schema/readiness.ts src/niche/schema/index.ts test/niche/schema/benchmark-manifests-readiness.test.ts`
```

```markdown
**[Sprint 1.3: Trace, Release, and Governance Schemas]**

**Context:** We are on Sprint 1 of 10. Sprint 1.2 added benchmark, manifest, and readiness schemas. Read `ARCHITECTURE.md` to ground your understanding of the trace store, release engine, and governance layers.

**Objective:** Define the schemas for replayable run traces, candidate releases, post-promotion monitoring, grader governance, reward governance, and lineage-bearing artifact references.

**Actionable Tasks:**

1. Create `src/niche/schema/trace.ts` with schemas and types for `RunTrace`, phase timestamps, replayability status, evidence bundle references, benchmark arm/case references, and deterministic replay metadata.
2. Create `src/niche/schema/release.ts` with schemas and types for `Artifact`, `ArtifactRef`, `LineageRef`, `CandidateRelease`, `CandidateRecipe`, and `PromotedReleaseMonitor`.
3. Create `src/niche/schema/governance.ts` with schemas and types for `GraderArtifact`, `ArbitrationArtifact`, `RewardArtifact`, derived-rights fields, and contamination/rights status fragments.
4. Update `src/niche/schema/index.ts` to export the new trace, release, and governance symbols.
5. Create `test/niche/schema/trace-release-governance.test.ts` covering replayability fields, lineage references, candidate recipe typing, governance schema validation, and derived-rights field propagation.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Every trace and governance field added in the NicheClaw docs must exist in a typed schema; do not collapse them into `Record<string, unknown>`.
- Keep field names and semantics consistent across trace, release, and governance schemas.
- Do not wire runtime behavior in this prompt; this prompt is schema-only.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/schema/trace-release-governance.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify `src/niche/schema/index.ts` exports all trace, release, and governance symbols.
5. Once all checks pass, run: `scripts/committer "feat(niche-schema): add trace release and governance schemas" src/niche/schema/trace.ts src/niche/schema/release.ts src/niche/schema/governance.ts src/niche/schema/index.ts test/niche/schema/trace-release-governance.test.ts`
```

```markdown
**[Sprint 2.1: Manifest, Artifact, and Lineage Stores]**

**Context:** We are on Sprint 2 of 10. Sprint 1 established all core niche schemas. Read `ARCHITECTURE.md` to ground your understanding of the NicheClaw data plane and the decision to start with stable file-backed stores under `src/niche/`.

**Objective:** Build production-ready file-backed stores for manifests, artifacts, and lineage records, with deterministic paths and typed read/write APIs.

**Actionable Tasks:**

1. Create `src/niche/store/paths.ts` that resolves NicheClaw state directories, registry roots, and file locations using existing OpenClaw path/state-dir conventions.
2. Create `src/niche/store/manifest-store.ts` with typed read/write/list APIs for `BaselineManifest`, `CandidateManifest`, and `SourceAccessManifest`.
3. Create `src/niche/store/artifact-registry.ts` with typed create/get/list APIs for `Artifact` and `ArtifactRef`, including content-hash validation and version-aware storage keys.
4. Create `src/niche/store/index.ts` that exports the new store entry points.
5. Create `test/niche/store/manifest-artifact-store.test.ts` covering path resolution, deterministic file naming, manifest round trips, duplicate-version rejection, and artifact hash integrity.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Reuse existing OpenClaw path and state-dir patterns; do not invent a parallel configuration system.
- Stores must be typed and deterministic. Silent overwrite behavior is not allowed.
- Do not implement benchmark execution or runtime wiring in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/store/manifest-artifact-store.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify all persisted objects validate against the corresponding schemas before being written.
5. Once all checks pass, run: `scripts/committer "feat(niche-store): add manifest and artifact registries" src/niche/store/paths.ts src/niche/store/manifest-store.ts src/niche/store/artifact-registry.ts src/niche/store/index.ts test/niche/store/manifest-artifact-store.test.ts`
```

```markdown
**[Sprint 2.2: Trace, Replay, and Lineage Stores]**

**Context:** We are on Sprint 2 of 10. Sprint 2.1 established deterministic file-backed stores for manifests and artifacts. Read `ARCHITECTURE.md` to ground your understanding of replayable traces and artifact lineage.

**Objective:** Build the trace store, replay-bundle store, and lineage store that will support benchmark replay, auditing, and later release decisions.

**Actionable Tasks:**

1. Create `src/niche/store/trace-store.ts` with typed append/get/list/query APIs for `RunTrace`, including phase timestamps, replayability status, and benchmark references.
2. Create `src/niche/store/replay-bundle.ts` with typed create/get APIs for replay bundles that capture context bundle IDs, evidence refs, deterministic replay metadata, `DeterminismRuntimePolicy` references, suite hashes, fixture versions, and environment snapshots.
3. Create `src/niche/store/lineage-store.ts` with typed write/query APIs for `LineageRef` relationships and reverse lookups from child artifacts to parents.
4. Update `src/niche/store/index.ts` to export the new stores.
5. Create `test/niche/store/trace-lineage-store.test.ts` covering append-only trace writes, replay-bundle integrity, lineage lookups, and invalid trace rejection when required fields are missing.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Trace writes must be append-only; mutation of historical traces is not allowed.
- Replay bundles must record enough information to distinguish replayable, partially replayable, and non-replayable runs.
- Do not patch the existing OpenClaw runtime yet; this prompt only creates the storage layer.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/store/trace-lineage-store.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify trace-store APIs reject writes that do not validate against the `RunTrace` schema.
5. Once all checks pass, run: `scripts/committer "feat(niche-store): add trace replay and lineage stores" src/niche/store/trace-store.ts src/niche/store/replay-bundle.ts src/niche/store/lineage-store.ts src/niche/store/index.ts test/niche/store/trace-lineage-store.test.ts`
```

```markdown
**[Sprint 2.3: Semantic Seam Contracts]**

**Context:** We are on Sprint 2 of 10. Sprint 2.2 added trace, replay, and lineage stores. Read `ARCHITECTURE.md` to ground your understanding of the planner, action, verifier, trace, and lifecycle seams that must remain stable as the fork evolves.

**Objective:** Define semantic seam interfaces and add contract tests that lock the expected behaviors before runtime wiring begins.

**Actionable Tasks:**

1. Create `src/niche/contracts/seams.ts` with typed interfaces for the planner seam, action seam, verifier seam, and trace seam. Each seam must define input/output payload contracts and invariants.
2. Create `src/niche/contracts/lifecycle.ts` with typed lifecycle event contracts for planner proposals, action proposals, verifier decisions, trace persistence, benchmark case start/finish, and candidate promotion.
3. Create `test/niche/contracts/seams.test.ts` covering seam invariants such as manifest-bound metadata, structured action proposals, verifier veto capability, and trace persistence requirements.
4. Create `test/niche/contracts/lifecycle.test.ts` covering required lifecycle event shapes and the guarantee that optimization services can subscribe to them without inspecting runtime internals.
5. Ensure `src/niche/index.ts` or a new contract export path exposes the seam contracts cleanly to later runtime code.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- These contracts must be semantic and stable. Do not encode line-number assumptions or brittle source-tree details into the tests.
- Keep contract types serializable and explicit. Avoid vague `unknown` payload blobs unless they are intentionally opaque and documented.
- Do not patch runtime code in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/contracts/seams.test.ts test/niche/contracts/lifecycle.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify the seam contracts align with the approved `v3.1a` semantic seam map.
5. Once all checks pass, run: `scripts/committer "test(niche): add semantic seam contracts" src/niche/contracts/seams.ts src/niche/contracts/lifecycle.ts test/niche/contracts/seams.test.ts test/niche/contracts/lifecycle.test.ts src/niche/index.ts`
```

```markdown
**[Sprint 3.1: Atomic Benchmark Registry and Runner]**

**Context:** We are on Sprint 3 of 10. Sprint 2 locked the data-plane stores and semantic seam contracts. Read `ARCHITECTURE.md` to ground your understanding of the Benchmark Lab and same-model comparison rules.

**Objective:** Build the benchmark suite registry, the atomic benchmark runner, and the paired-statistics helper required to compare a baseline manifest and a candidate manifest honestly.

**Actionable Tasks:**

1. Create `src/niche/benchmark/suite-registry.ts` with typed create/get/list APIs for atomic benchmark suites and benchmark arm metadata covering `offline_gold`, `offline_shadow`, `live_shadow`, and `live_canary`.
2. Create `src/niche/benchmark/atomic-runner.ts` that accepts a suite, a baseline manifest, a candidate manifest, and paired execution callbacks; it must emit per-case paired results, contamination-audit metadata, and benchmark-run summaries that expose provider metadata quality.
3. Create `src/niche/benchmark/statistics.ts` with deterministic paired-delta utilities and bootstrap confidence interval helpers suitable for the benchmark protocol in `PRD.md`.
4. Create `src/niche/benchmark/index.ts` exporting the suite registry, atomic runner, and statistics helpers.
5. Create `test/niche/benchmark/atomic-runner.test.ts` covering paired-case execution, confidence interval output, contamination-audit output, invalid result rejection, and manifest mismatch invalidation.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Keep the runner model-agnostic. It must compare manifests and results, not assume a specific provider API.
- Statistical helpers must be deterministic for tests when seeded.
- Benchmark outputs must surface provider metadata quality instead of assuming exact model snapshots always exist.
- Do not implement episode runs, grader arbitration, or runtime wiring in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/benchmark/atomic-runner.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify the runner invalidates comparisons when baseline and candidate manifests are incompatible and includes contamination-audit metadata in successful results.
5. Once all checks pass, run: `scripts/committer "feat(niche-benchmark): add atomic benchmark runner" src/niche/benchmark/suite-registry.ts src/niche/benchmark/atomic-runner.ts src/niche/benchmark/statistics.ts src/niche/benchmark/index.ts test/niche/benchmark/atomic-runner.test.ts`
```

```markdown
**[Sprint 3.2: Episode Benchmarking, Invalidation, and Grader Arbitration]**

**Context:** We are on Sprint 3 of 10. Sprint 3.1 added the atomic benchmark registry and runner. Read `ARCHITECTURE.md` to ground your understanding of episode-level behavior, benchmark invalidation, and grader arbitration.

**Objective:** Add episode-case support, benchmark invalidation logic, and explicit grader arbitration so long-horizon workflows and grader conflicts are governed correctly.

**Actionable Tasks:**

1. Create `src/niche/benchmark/episode-runner.ts` that executes `EpisodeCase` suites, records step-level metrics, and emits episode summaries compatible with the existing benchmark result model.
2. Create `src/niche/benchmark/invalidation.ts` with reusable invalidation logic for manifest incompatibility, contamination flags, suite drift, benchmark-suite hash drift, grader-version drift, fixture-version drift, and unequal source access.
3. Create `src/niche/benchmark/arbitration.ts` with typed support for `rule_first`, `hierarchical_override`, `weighted_vote`, and `sme_required_on_conflict` arbitration policies.
4. Update `src/niche/benchmark/index.ts` to export the episode runner, invalidation helpers, and arbitration entry points.
5. Create `test/niche/benchmark/episode-arbitration.test.ts` covering episode step metrics, invalidation rules, suite-hash drift, fixture-version drift, and arbitration behavior on mixed rule/model/SME grader signals.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Episode results must preserve per-step latency, cost, tool misuse, verifier intervention, and recovery information.
- Arbitration must be explicit and deterministic; silent averaging or implicit precedence is not allowed.
- Invalidation must treat benchmark-suite hashes and fixture versions as first-class reproducibility inputs.
- Do not wire the runtime into benchmark execution yet.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/benchmark/episode-arbitration.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify episode comparisons and atomic comparisons can coexist without schema drift and that benchmark-suite hash mismatches invalidate runs.
5. Once all checks pass, run: `scripts/committer "feat(niche-benchmark): add episode runner and grader arbitration" src/niche/benchmark/episode-runner.ts src/niche/benchmark/invalidation.ts src/niche/benchmark/arbitration.ts src/niche/benchmark/index.ts test/niche/benchmark/episode-arbitration.test.ts`
```

```markdown
**[Sprint 3.3: Grader Registry, Calibration, and Fixture Versioning]**

**Context:** We are on Sprint 3 of 10. Sprint 3.2 added episode benchmarking, invalidation, and grader arbitration. Read `ARCHITECTURE.md` to ground your understanding of grader calibration, SME sampling, and benchmark fixture reproducibility.

**Objective:** Build the grader registry, calibration runtime, and benchmark fixture/version hashing support so promotion-gating graders and suites are versioned, auditable, and trustworthy.

**Actionable Tasks:**

1. Create `src/niche/benchmark/grader-registry.ts` with typed create/get/list APIs for `GraderArtifact`, `ArbitrationArtifact`, grader-set composition, and benchmark fixture metadata.
2. Create `src/niche/benchmark/calibration.ts` that runs graders against calibration suites, records agreement metrics, and enforces minimum SME sampling rules from the approved docs.
3. Create `src/niche/benchmark/fixture-versioning.ts` that computes stable hashes for benchmark suites, fixture packs, and environment snapshots used by replay bundles.
4. Update `src/niche/benchmark/index.ts` to export the grader-registry, calibration, and fixture-versioning entry points.
5. Create `test/niche/benchmark/grader-registry.test.ts` covering grader registration, calibration metrics, SME sampling enforcement, and stable suite/fixture hashing.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Calibration output must be typed and durable enough to gate promotion decisions later.
- Fixture hashing must be stable across runs for the same content; avoid machine-specific path noise in hashes.
- Do not patch runtime execution in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/benchmark/grader-registry.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify graders cannot be marked promotion-eligible without calibration output and required SME sampling metadata.
5. Once all checks pass, run: `scripts/committer "feat(niche-benchmark): add grader registry and calibration" src/niche/benchmark/grader-registry.ts src/niche/benchmark/calibration.ts src/niche/benchmark/fixture-versioning.ts src/niche/benchmark/index.ts test/niche/benchmark/grader-registry.test.ts`
```

```markdown
**[Sprint 4.1: Domain Compiler Ingest and Compile Pipeline]**

**Context:** We are on Sprint 4 of 10. Sprint 3 completed the benchmark core for atomic and episode comparisons. Read `ARCHITECTURE.md` to ground your understanding of the Domain Compiler and the first repo/terminal/CI niche.

**Objective:** Build the first production-ready domain-ingest and compile pipeline that converts raw niche inputs into a `DomainPack` plus benchmark seed inputs.

**Actionable Tasks:**

1. Create `src/niche/domain/source-types.ts` defining typed source descriptors, provenance fragments, rights metadata, and ingest result shapes.
2. Create `src/niche/domain/source-ingest.ts` with source normalization helpers for local files, repo-relative assets, structured text inputs, and pre-curated benchmark seed sources.
3. Create `src/niche/domain/compiler.ts` that compiles typed source inputs into a `DomainPack` skeleton, benchmark seed hints, and evidence-source registry entries.
4. Create `src/niche/domain/index.ts` exporting the source and compiler entry points.
5. Create `test/niche/domain/compiler.test.ts` covering source normalization, rights-tag preservation, compiler outputs, and failure taxonomy generation.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Preserve provenance and rights metadata all the way through compilation.
- Keep the compiler deterministic for the same inputs; if heuristic ordering is required, sort explicitly.
- Do not implement readiness thresholds or rights propagation in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/domain/compiler.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify compiled outputs validate against the `DomainPack` schema from Sprint 1.
5. Once all checks pass, run: `scripts/committer "feat(niche-domain): add compiler ingest pipeline" src/niche/domain/source-types.ts src/niche/domain/source-ingest.ts src/niche/domain/compiler.ts src/niche/domain/index.ts test/niche/domain/compiler.test.ts`
```

```markdown
**[Sprint 4.2: Readiness Gate, Thresholds, and Rights Propagation]**

**Context:** We are on Sprint 4 of 10. Sprint 4.1 added the domain ingest and compile pipeline. Read `ARCHITECTURE.md` to ground your understanding of the readiness gate, hard blockers, and derivative-rights propagation rules.

**Objective:** Build an enforceable readiness gate with default thresholds and a derivative-rights propagation layer that can block unsafe or non-benchmarkable niches before training begins.

**Actionable Tasks:**

1. Create `src/niche/domain/readiness-thresholds.ts` with default threshold values and typed configuration for source quality, source coverage, contradiction rate, benchmarkability, tool availability, and freshness.
2. Create `src/niche/domain/rights-propagation.ts` with typed helpers that propagate `rights_to_store`, `rights_to_train`, `rights_to_benchmark`, `rights_to_derive`, `rights_to_distill`, and `rights_to_generate_synthetic_from` across derivative artifacts.
3. Create `src/niche/domain/readiness-gate.ts` that scores a niche, emits a `ReadinessReport`, enforces hard blockers, and returns `ready`, `ready_with_warnings`, or `not_ready` deterministically.
4. Update `src/niche/domain/index.ts` to export thresholds, rights propagation, and readiness-gate helpers.
5. Create `test/niche/domain/readiness-rights.test.ts` covering threshold enforcement, hard blockers, derivative-rights inheritance, and refusal behavior for non-ready niches.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- The readiness gate must be deterministic and machine-enforceable, not a vague heuristic.
- Rights propagation must inherit the most restrictive allowed state unless an explicit stronger authorization record is present.
- Do not implement runtime training or release logic in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/domain/readiness-rights.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify the readiness gate can emit a machine-readable refusal state with hard blockers and recommended next actions.
5. Once all checks pass, run: `scripts/committer "feat(niche-domain): add readiness gate and rights propagation" src/niche/domain/readiness-thresholds.ts src/niche/domain/rights-propagation.ts src/niche/domain/readiness-gate.ts src/niche/domain/index.ts test/niche/domain/readiness-rights.test.ts`
```

```markdown
**[Sprint 5.1: Action Policy Guard and Selector]**

**Context:** We are on Sprint 5 of 10. Sprint 4 delivered the Domain Compiler and readiness gate. Read `ARCHITECTURE.md` to ground your understanding of the action policy split into contract guard, tool selector, and repair/retry policy.

**Objective:** Build the first two layers of the action policy: a deterministic contract guard and a structured tool selector that emits ranked `ActionProposal` objects.

**Actionable Tasks:**

1. Create `src/niche/action-policy/types.ts` with typed `ActionProposal`, guard-decision payloads, selector ranking entries, and repair strategy references aligned to the approved schemas.
2. Create `src/niche/action-policy/contract-guard.ts` that validates tool availability, schema presence, permission rules, domain constraints, and release constraints before execution.
3. Create `src/niche/action-policy/tool-selector.ts` that ranks candidate tools, scores the selected action, and emits structured proposal objects without executing them.
4. Create `src/niche/action-policy/index.ts` exporting the action-policy entry points.
5. Create `test/niche/action-policy/guard-selector.test.ts` covering blocked actions, ranked candidates, selector scoring, and proposal serialization.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Keep the contract guard deterministic and side-effect free.
- The tool selector must emit structured rankings and reasons, not opaque strings.
- Do not wire the runtime or implement repair logic in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/action-policy/guard-selector.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify `ActionProposal` outputs contain the required ranking, guard, and reason fields from the approved docs.
5. Once all checks pass, run: `scripts/committer "feat(niche-action): add contract guard and tool selector" src/niche/action-policy/types.ts src/niche/action-policy/contract-guard.ts src/niche/action-policy/tool-selector.ts src/niche/action-policy/index.ts test/niche/action-policy/guard-selector.test.ts`
```

```markdown
**[Sprint 5.2: Repair Policy, Action Mediator, and Trace Capture Helpers]**

**Context:** We are on Sprint 5 of 10. Sprint 5.1 delivered the contract guard and tool selector. Read `ARCHITECTURE.md` to ground your understanding of the repair/retry layer and the action-mediation runtime boundary.

**Objective:** Build the repair/retry policy, the runtime-facing action mediator, and the reusable run-trace capture helpers that later OpenClaw patches will call.

**Actionable Tasks:**

1. Create `src/niche/action-policy/repair-policy.ts` that decides when to retry, repair, escalate, or stop based on prior attempts, guard failures, and tool outcomes.
2. Create `src/niche/runtime/action-mediator.ts` that composes the guard, selector, and repair policy into a single mediator API suitable for runtime wiring.
3. Create `src/niche/runtime/run-trace-capture.ts` that exposes typed helpers for recording planner events, action proposals, tool outcomes, verifier decisions, and final outputs into the trace store.
4. Create `src/niche/runtime/index.ts` exporting the action mediator and trace capture helpers.
5. Create `test/niche/action-policy/repair-mediator.test.ts` covering retry decisions, escalation decisions, mediator outputs, and trace-capture helper payloads.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Keep repair policy decisions explicit and typed; silent fallback behavior is not allowed.
- The mediator must not directly depend on OpenClaw runtime internals yet; it should accept plain typed inputs.
- Do not patch existing OpenClaw runtime files in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/action-policy/repair-mediator.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify the mediator emits proposals that can be persisted by the trace store without additional transformation.
5. Once all checks pass, run: `scripts/committer "feat(niche-action): add repair policy and action mediator" src/niche/action-policy/repair-policy.ts src/niche/runtime/action-mediator.ts src/niche/runtime/run-trace-capture.ts src/niche/runtime/index.ts test/niche/action-policy/repair-mediator.test.ts`
```

```markdown
**[Sprint 5.3: OpenClaw Runtime Wiring for Action Mediation and Tool Traces]**

**Context:** We are on Sprint 5 of 10. Sprint 5.2 created the action mediator and trace-capture helpers. Read `ARCHITECTURE.md` to ground your understanding of the action seam and the existing OpenClaw tool lifecycle.

**Objective:** Patch the existing OpenClaw runtime so action proposals and tool execution outcomes flow through the NicheClaw mediator and into the durable trace path.

**Actionable Tasks:**

1. Patch `src/agents/pi-tools.before-tool-call.ts` to invoke the NicheClaw action mediator before a tool call is executed, preserving existing behavior when NicheClaw mode is inactive.
2. Patch `src/agents/pi-embedded-subscribe.handlers.tools.ts` to record tool start, partial update, result, and error events through `src/niche/runtime/run-trace-capture.ts`.
3. Patch `src/agents/pi-embedded-runner/run/attempt.ts` to register per-run trace context, persist `ActionProposal` objects, and attach benchmark/manifest metadata when NicheClaw mode is active.
4. Update `src/niche/runtime/run-trace-capture.ts` as needed to support the OpenClaw runtime integration cleanly without leaking `any` types.
5. Create `test/niche/runtime/action-wiring.test.ts` covering mediator invocation, trace event emission, and the guarantee that non-NicheClaw runs preserve existing OpenClaw behavior.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Preserve existing OpenClaw runtime behavior when NicheClaw is not explicitly active.
- Avoid broad refactors; patch only the action seam and the required trace metadata path.
- Do not add a new tool-execution abstraction outside these files in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/runtime/action-wiring.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Run the smallest relevant existing runtime tests that cover the touched tool path and keep them green.
5. Once all checks pass, run: `scripts/committer "feat(niche-runtime): wire action mediation into tool execution" src/agents/pi-tools.before-tool-call.ts src/agents/pi-embedded-subscribe.handlers.tools.ts src/agents/pi-embedded-runner/run/attempt.ts src/niche/runtime/run-trace-capture.ts test/niche/runtime/action-wiring.test.ts`
```

```markdown
**[Sprint 6.1: Verifier Pack Core]**

**Context:** We are on Sprint 6 of 10. Sprint 5 completed the action policy and runtime action-trace wiring. Read `ARCHITECTURE.md` to ground your understanding of verifier packs, grounding checks, constraint checks, and false-veto discipline.

**Objective:** Build the verifier-pack core for grounding, constraint, and confidence checks, along with typed outputs and verifier metrics that later delivery-stage gating and release policy can consume.

**Actionable Tasks:**

1. Create `src/niche/verifier/pack.ts` with typed `VerifierDecision`, `VerifierFinding`, verifier-pack configuration, and pack orchestration helpers.
2. Create `src/niche/verifier/grounding.ts` implementing evidence-grounding checks against recorded evidence bundles and declared source access.
3. Create `src/niche/verifier/constraints.ts` implementing domain-constraint checks, format checks, and release-policy aware veto conditions.
4. Create `src/niche/verifier/metrics.ts` with typed helpers for verifier true-positive, false-positive, false-veto, pass-through, latency-added, cost-added, and override-rate aggregation.
5. Create `src/niche/verifier/index.ts` exporting the verifier-pack and metrics entry points.
6. Create `test/niche/verifier/pack.test.ts` covering pass, veto, repair-request, escalation outcomes, false-veto-sensitive cases, and verifier metric aggregation inputs.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Verifier outputs must be structured and traceable. Do not reduce decisions to plain strings.
- Grounding checks must use declared evidence/source inputs, not hidden runtime globals.
- Verifier metrics must be explicit and typed so later promotion logic can reason about false-veto and override behavior.
- Do not patch delivery or finalization code in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/verifier/pack.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify verifier decisions and metric inputs can be serialized and persisted into `RunTrace`.
5. Once all checks pass, run: `scripts/committer "feat(niche-verifier): add verifier pack core" src/niche/verifier/pack.ts src/niche/verifier/grounding.ts src/niche/verifier/constraints.ts src/niche/verifier/metrics.ts src/niche/verifier/index.ts test/niche/verifier/pack.test.ts`
```

```markdown
**[Sprint 6.2: Final Output Verifier Gate Wiring]**

**Context:** We are on Sprint 6 of 10. Sprint 6.1 built the core verifier pack. Read `ARCHITECTURE.md` to ground your understanding of the verifier seam and the requirement that final output can be vetoed or repaired before user-visible delivery.

**Objective:** Patch the finalization and delivery path so verifier decisions can approve, repair, escalate, or veto candidate outputs before they are emitted.

**Actionable Tasks:**

1. Create `src/niche/runtime/verifier-gate.ts` that accepts candidate final outputs plus verifier decisions and returns a typed finalization result.
2. Patch `src/auto-reply/reply/agent-runner.ts` to invoke the verifier gate before final payload shaping when NicheClaw mode is active.
3. Patch `src/commands/agent/delivery.ts` to respect verifier-gate outcomes, including veto, repair-request, and escalation results.
4. Patch `src/auto-reply/reply/dispatch-from-config.ts` so channel-delivery paths also respect verifier-gate outcomes for NicheClaw runs.
5. Create `test/niche/runtime/verifier-gate.test.ts` covering approved outputs, vetoed outputs, repair loops, and the guarantee that standard OpenClaw delivery behavior remains unchanged when NicheClaw is inactive.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Preserve normal OpenClaw delivery behavior when NicheClaw mode is not active.
- Keep verifier gating explicit and typed; silent output suppression is not allowed.
- Do not implement release promotion in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/runtime/verifier-gate.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Run the smallest relevant existing reply/delivery tests that cover the touched finalization path and keep them green.
5. Once all checks pass, run: `scripts/committer "feat(niche-runtime): add final output verifier gate" src/niche/runtime/verifier-gate.ts src/auto-reply/reply/agent-runner.ts src/commands/agent/delivery.ts src/auto-reply/reply/dispatch-from-config.ts test/niche/runtime/verifier-gate.test.ts`
```

```markdown
**[Sprint 6.3: Release Engine and Post-Promotion Monitor]**

**Context:** We are on Sprint 6 of 10. Sprint 6.2 wired the verifier gate into final delivery. Read `ARCHITECTURE.md` to ground your understanding of candidate promotion, rollback, and post-promotion drift monitoring.

**Objective:** Build the release engine core that can compare a candidate against a baseline, apply release policy, and create a promoted-release monitor with rollback thresholds.

**Actionable Tasks:**

1. Create `src/niche/release/policy-engine.ts` that evaluates benchmark results, verifier metrics, latency/cost budgets, and post-promotion constraints against a candidate and a baseline.
2. Create `src/niche/release/promotion-controller.ts` that turns policy-engine outputs into typed promotion, rejection, shadow, canary, or rollback decisions.
3. Create `src/niche/release/promoted-monitor.ts` that models the `PromotedReleaseMonitor`, drift thresholds, freshness-decay policy, rollback policy, shadow recheck cadence, evaluation windows, alert hysteresis, and rollback cooldown defaults.
4. Create `src/niche/release/index.ts` exporting the release-engine entry points.
5. Create `test/niche/release/promotion-controller.test.ts` covering promotion, rejection, shadow-only, canary, drift-triggered rollback, invalid benchmark evidence scenarios, and monitor cadence/hysteresis defaults.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Promotion decisions must be explicit and reproducible from typed inputs; hidden heuristics are not allowed.
- Drift monitoring must be typed and serializable, not ad hoc runtime logic.
- Monitor cadence, hysteresis, and rollback cooldown behavior must have explicit defaults rather than narrative-only comments.
- Do not add UI surfaces in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/release/promotion-controller.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify release decisions and promoted-monitor objects validate against the approved schemas and include explicit cadence defaults.
5. Once all checks pass, run: `scripts/committer "feat(niche-release): add release engine and promoted monitor" src/niche/release/policy-engine.ts src/niche/release/promotion-controller.ts src/niche/release/promoted-monitor.ts src/niche/release/index.ts test/niche/release/promotion-controller.test.ts`
```

```markdown
**[Sprint 6.4: Rights Revocation, Invalidation, and Purge Flow]**

**Context:** We are on Sprint 6 of 10. Sprint 6.3 added the release engine and promoted-release monitor. Read `ARCHITECTURE.md` to ground your understanding of lineage, derived-data rights, and the need to invalidate downstream artifacts when upstream rights change.

**Objective:** Add lineage-based rights revocation, artifact invalidation, and purge planning so downstream candidate artifacts, datasets, and promoted releases can be invalidated safely when an upstream source is reclassified or revoked.

**Actionable Tasks:**

1. Create `src/niche/release/rights-revocation.ts` that traces lineage from a revoked source or artifact through derivative datasets, candidate recipes, manifests, and promoted releases.
2. Create `src/niche/release/invalidation-plan.ts` that emits a typed invalidation and purge plan showing what must be quarantined, rebuilt, rolled back, or deleted.
3. Update `src/niche/release/index.ts` to export the new rights-revocation and invalidation-plan entry points.
4. Patch the artifact and lineage stores only as needed so revocation traversal has the data it needs without introducing broad schema drift.
5. Create `test/niche/release/rights-revocation.test.ts` covering revoked upstream sources, derived-artifact invalidation, promoted-release impact assessment, and rebuild requirements.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Rights revocation must be lineage-driven and explicit; silent stale artifacts are not allowed.
- Purge and rollback plans must be typed, inspectable outputs rather than destructive side effects in the same call.
- Keep this prompt scoped to invalidation planning, not UI or CLI surfaces.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/release/rights-revocation.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify invalidation plans can identify downstream artifacts and promoted releases using lineage data alone.
5. Once all checks pass, run: `scripts/committer "feat(niche-release): add rights revocation and invalidation planning" src/niche/release/rights-revocation.ts src/niche/release/invalidation-plan.ts src/niche/release/index.ts src/niche/store/artifact-registry.ts src/niche/store/lineage-store.ts test/niche/release/rights-revocation.test.ts`
```

```markdown
**[Sprint 7.1: Candidate Recipes, Data Synthesis, and Lineage Runtime]**

**Context:** We are on Sprint 7 of 10. Sprint 6 completed the verifier, release, and governance path. Read `ARCHITECTURE.md` to ground your understanding of the optimization plane, candidate recipes, and lineage-bearing specialization artifacts.

**Objective:** Build the runtime services that materialize `CandidateRecipe` objects, synthesize candidate-training inputs from approved sources, and emit lineage-connected recipe artifacts suitable for optimizer execution.

**Actionable Tasks:**

1. Create `src/niche/optimizer/candidate-recipe.ts` with typed helpers that build `CandidateRecipe` artifacts from domain packs, benchmark evidence, action/verifier configs, and approved input datasets.
2. Create `src/niche/optimizer/data-synthesis.ts` with typed utilities for generating synthetic task inputs, trace-derived examples, and teacher-rollout requests while preserving rights metadata and embargo rules.
3. Create `src/niche/optimizer/lineage-runtime.ts` that records the lineage edges between source datasets, synthetic artifacts, candidate recipes, and downstream optimization inputs.
4. Create `src/niche/optimizer/index.ts` exporting the candidate-recipe, data-synthesis, and lineage-runtime entry points.
5. Create `test/niche/optimizer/candidate-recipe.test.ts` covering recipe generation, lineage attachment, embargo-aware data synthesis, and derived-rights preservation.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Data synthesis must not violate contamination rules or live-trace embargo policy.
- Candidate recipes must be typed, reproducible, and connected to lineage records; narrative-only recipe fields are not allowed.
- Do not implement a job scheduler or runtime execution loop in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/optimizer/candidate-recipe.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify synthesized outputs are blocked when rights or embargo rules do not permit derivation.
5. Once all checks pass, run: `scripts/committer "feat(niche-optimizer): add candidate recipes and data synthesis" src/niche/optimizer/candidate-recipe.ts src/niche/optimizer/data-synthesis.ts src/niche/optimizer/lineage-runtime.ts src/niche/optimizer/index.ts test/niche/optimizer/candidate-recipe.test.ts`
```

```markdown
**[Sprint 7.2: Niche Gym and Episode Environment Harness]**

**Context:** We are on Sprint 7 of 10. Sprint 7.1 added candidate recipes and data-synthesis runtime services. Read `ARCHITECTURE.md` to ground your understanding of Niche Gym and the repo/terminal/CI pilot as the first long-horizon environment.

**Objective:** Build the first Niche Gym harness for repo/terminal/CI workflows so episode benchmarks and teacher rollouts have a deterministic environment for long-horizon evaluation.

**Actionable Tasks:**

1. Create `src/niche/gym/types.ts` with typed environment state, step results, termination reasons, and episode replay metadata.
2. Create `src/niche/gym/repo-ci-environment.ts` that models a deterministic repo/terminal/CI episode environment with frozen fixtures, explicit tool access, and replayable step transitions.
3. Create `src/niche/gym/episode-harness.ts` that executes episode cases against the environment, records step outcomes, and emits gym traces compatible with the benchmark and trace stores.
4. Create `src/niche/gym/index.ts` exporting the gym types and repo/terminal/CI environment entry points.
5. Create `test/niche/gym/repo-ci-environment.test.ts` covering deterministic reset behavior, step transitions, fixture freezing, and replay compatibility.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- The gym must be deterministic for the same fixtures, seeds, and environment snapshots.
- Episode harness outputs must be reusable by both benchmark runners and teacher rollout services.
- Do not wire the gym into the CLI in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/gym/repo-ci-environment.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify the environment can replay the same episode trace deterministically from the same fixture snapshot and seed.
5. Once all checks pass, run: `scripts/committer "feat(niche-gym): add repo ci niche gym harness" src/niche/gym/types.ts src/niche/gym/repo-ci-environment.ts src/niche/gym/episode-harness.ts src/niche/gym/index.ts test/niche/gym/repo-ci-environment.test.ts`
```

```markdown
**[Sprint 7.3: Optimizer Orchestrator and Reward Registry]**

**Context:** We are on Sprint 7 of 10. Sprint 7.2 added the first Niche Gym harness. Read `ARCHITECTURE.md` to ground your understanding of the optimization loop, teacher rollouts, candidate generation, and reward-artifact governance.

**Objective:** Build the optimizer orchestrator that can schedule candidate-generation jobs, teacher rollouts, and reward-aware optimization inputs without violating governance or contamination rules.

**Actionable Tasks:**

1. Create `src/niche/optimizer/orchestrator.ts` with typed orchestration flows for candidate generation, teacher rollout requests, verifier-refresh jobs, and evaluation-job preparation.
2. Create `src/niche/optimizer/reward-registry.ts` with typed create/get/list APIs for `RewardArtifact`, calibration metadata, and reward-artifact lineage.
3. Create `src/niche/optimizer/job-model.ts` with typed job definitions, statuses, and job-result metadata for asynchronous optimization-plane work.
4. Update `src/niche/optimizer/index.ts` to export the orchestrator, reward registry, and job model entry points.
5. Create `test/niche/optimizer/orchestrator.test.ts` covering job creation, reward-artifact registration, teacher-rollout preparation, and governance checks that block uncalibrated reward artifacts from promotion-eligible flows.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Reward artifacts must be governed like graders when they influence candidate generation or training.
- The orchestrator must emit typed job models and artifact refs; it must not run hidden side effects without persisted metadata.
- Do not implement provider-native fine-tuning adapters in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/optimizer/orchestrator.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify promotion-eligible job plans cannot reference uncalibrated reward artifacts.
5. Once all checks pass, run: `scripts/committer "feat(niche-optimizer): add orchestrator and reward registry" src/niche/optimizer/orchestrator.ts src/niche/optimizer/reward-registry.ts src/niche/optimizer/job-model.ts src/niche/optimizer/index.ts test/niche/optimizer/orchestrator.test.ts`
```

```markdown
**[Sprint 7.4: Provider-Native Tuning Adapters and Capability Gating]**

**Context:** We are on Sprint 7 of 10. Sprint 7.3 added the optimizer orchestrator and reward registry. Read `ARCHITECTURE.md` to ground your understanding of multi-lane specialization and the requirement that provider-native tuning be supported where available without pretending it exists everywhere.

**Objective:** Build provider-native tuning adapter interfaces and capability-gating logic so NicheClaw can honestly use direct model customization when supported and cleanly fall back to sidecar or distillation lanes when it is not.

**Actionable Tasks:**

1. Create `src/niche/optimizer/tuning-capabilities.ts` with typed capability descriptors for provider-native optimization support, including tuning availability, artifact types, metadata quality, and required credentials.
2. Create `src/niche/optimizer/tuning-adapters.ts` with provider-agnostic adapter interfaces and at least one concrete adapter implementation path that can represent provider-native tuning jobs without claiming universal support.
3. Create `src/niche/optimizer/tuning-planner.ts` that selects a valid specialization lane based on provider capability, rights state, available artifacts, and operator policy.
4. Update `src/niche/optimizer/index.ts` to export the tuning capability, adapter, and planning entry points.
5. Create `test/niche/optimizer/tuning-adapters.test.ts` covering capability gating, lane selection, unsupported-provider fallback behavior, and tuning-plan serialization.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Capability gating must be explicit and truthful; unsupported providers must never be represented as tunable.
- Adapter interfaces must preserve provider metadata quality rather than inventing fake snapshot guarantees.
- Do not invoke live provider APIs or add external service dependencies in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/optimizer/tuning-adapters.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify lane selection can explicitly choose sidecar or distillation when provider-native tuning is unavailable.
5. Once all checks pass, run: `scripts/committer "feat(niche-optimizer): add tuning capability adapters" src/niche/optimizer/tuning-capabilities.ts src/niche/optimizer/tuning-adapters.ts src/niche/optimizer/tuning-planner.ts src/niche/optimizer/index.ts test/niche/optimizer/tuning-adapters.test.ts`
```

```markdown
**[Sprint 7.5: Continuous Optimization Loop and Drift-Triggered Refresh Planning]**

**Context:** We are on Sprint 7 of 10. Sprint 7.4 added provider-native tuning capability gating. Read `ARCHITECTURE.md` to ground your understanding of the continuous optimization loop, shadow analysis, and drift-aware candidate refresh planning.

**Objective:** Build the recurring optimization loop that turns live traces, drift signals, and failure clusters into governed candidate-refresh plans without contaminating held-out evaluation.

**Actionable Tasks:**

1. Create `src/niche/optimizer/continuous-loop.ts` with typed planning logic for ingesting eligible live traces, clustering failures, selecting refresh opportunities, and generating candidate-refresh plans.
2. Create `src/niche/optimizer/drift-signals.ts` with typed helpers that consume promoted-monitor outputs, verifier drift, grader drift, and source freshness decay to decide whether a refresh plan is warranted.
3. Create `src/niche/optimizer/refresh-policy.ts` that encodes embargo-aware, rights-aware rules for when live traces can enter optimization flows and when they must remain quarantined.
4. Update `src/niche/optimizer/index.ts` to export the continuous-loop, drift-signals, and refresh-policy entry points.
5. Create `test/niche/optimizer/continuous-loop.test.ts` covering drift-triggered refresh planning, embargo enforcement, failure-cluster prioritization, and invalid refresh-plan rejection when contamination rules would be violated.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Continuous optimization must never consume gold or hidden eval data.
- Refresh planning must be explicit and typed; no hidden auto-promotion or silent retraining behavior is allowed.
- Do not add cron or external scheduling integration in this prompt; build the planning layer only.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/optimizer/continuous-loop.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Verify refresh plans are blocked when contamination or rights policies would make the plan invalid.
5. Once all checks pass, run: `scripts/committer "feat(niche-optimizer): add continuous optimization planning" src/niche/optimizer/continuous-loop.ts src/niche/optimizer/drift-signals.ts src/niche/optimizer/refresh-policy.ts src/niche/optimizer/index.ts test/niche/optimizer/continuous-loop.test.ts`
```

```markdown
**[Sprint 8.1: Niche CLI Control Plane]**

**Context:** We are on Sprint 8 of 10. Sprint 7 completed the core optimization-plane scaffolding. Read `ARCHITECTURE.md` to ground your understanding of the intended CLI-first control plane for MVP and near-term expansion.

**Objective:** Add a first-class `niche` CLI surface for initializing a niche workspace, running benchmarks, and starting optimization plans from the NicheClaw core services.

**Actionable Tasks:**

1. Create `src/commands/niche/init.ts` with a command handler that initializes the NicheClaw state roots, validates architecture anchors, and can create a starter niche program manifest.
2. Create `src/commands/niche/benchmark.ts` with a command handler that loads a baseline manifest, candidate manifest, and benchmark suite, then runs the benchmark pipeline using the NicheClaw benchmark services.
3. Create `src/commands/niche/optimize.ts` with a command handler that creates or previews typed optimization job plans using the NicheClaw optimizer services without executing hidden side effects.
4. Create `src/cli/program/register.niche.ts` that registers the `niche` command and its `init` / `benchmark` / `optimize` subcommands using existing CLI registration patterns.
5. Patch `src/cli/program/command-registry.ts` to load and register the new niche command group.
6. Create `src/cli/program/register.niche.test.ts` covering command registration, help output, and argument validation.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- Follow the existing `src/cli/program/register.*.ts` patterns exactly.
- Do not introduce a parallel CLI framework or a separate binary.
- Keep the CLI surface focused on initialization, benchmarking, and explicit optimization planning; do not add hidden background execution.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run src/cli/program/register.niche.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Manually run the CLI help for the new `niche` commands and verify the subcommands appear.
5. Once all checks pass, run: `scripts/committer "feat(cli): add niche init benchmark and optimize commands" src/commands/niche/init.ts src/commands/niche/benchmark.ts src/commands/niche/optimize.ts src/cli/program/register.niche.ts src/cli/program/command-registry.ts src/cli/program/register.niche.test.ts`
```

```markdown
**[Sprint 8.2: Repo/Terminal/CI Pilot and Release CLI]**

**Context:** We are on Sprint 8 of 10. Sprint 8.1 added the niche CLI entrypoint for initialization and benchmarking. Read `ARCHITECTURE.md` to ground your understanding of the first repo/terminal/CI pilot and the release decision workflow.

**Objective:** Add the first real pilot niche assets plus a release CLI command so the system can exercise an end-to-end same-model benchmark-and-promote flow on the repo/terminal/CI niche.

**Actionable Tasks:**

1. Create `src/commands/niche/release.ts` with a command handler that loads benchmark evidence, release policy inputs, and promoted-monitor settings, then emits a release decision using the NicheClaw release engine.
2. Create `src/niche/pilots/repo-ci/seed-domain-pack.ts` that builds the first repo/terminal/CI pilot `DomainPack` with task families, tool contracts, failure taxonomy, and verifier defaults suitable for this repository class.
3. Create `src/niche/pilots/repo-ci/seed-benchmark-suite.ts` that emits atomic and episode benchmark seeds for repo navigation, tool selection, repair loops, and long-horizon repo/terminal/CI workflows.
4. Create `src/niche/pilots/repo-ci/index.ts` exporting the repo/terminal/CI seed helpers.
5. Create `test/niche/pilots/repo-ci.test.ts` covering pilot domain-pack validity, benchmark-seed validity, and release-command compatibility with the pilot assets.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- The pilot must be realistic and benchmarkable; do not fill it with toy tasks or fake categories.
- Keep the pilot generic enough to serve as a reusable repo/terminal/CI wedge, not a one-off tuned only to this current workspace.
- Do not add UI surfaces or multi-tenant logic in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run test/niche/pilots/repo-ci.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Manually invoke the niche benchmark and release commands against the pilot assets and verify they produce typed outputs.
5. Once all checks pass, run: `scripts/committer "feat(niche-pilot): add repo terminal ci pilot and release command" src/commands/niche/release.ts src/niche/pilots/repo-ci/seed-domain-pack.ts src/niche/pilots/repo-ci/seed-benchmark-suite.ts src/niche/pilots/repo-ci/index.ts test/niche/pilots/repo-ci.test.ts`
```

```markdown
**[Sprint 8.3: Artifact Inspection, Comparison, and Governance CLI]**

**Context:** We are on Sprint 8 of 10. Sprint 8.2 added the first real repo/terminal/CI pilot assets and the release CLI command. Read `ARCHITECTURE.md` to ground your understanding of the control-plane needs for artifact inspection, candidate comparison, and governance visibility.

**Objective:** Add CLI inspection and comparison commands so operators can inspect manifests, compare baseline vs candidate artifacts, and review governance-critical metadata without reading raw files directly.

**Actionable Tasks:**

1. Create `src/commands/niche/inspect.ts` with command handlers for inspecting manifests, candidate recipes, artifacts, and promoted monitors in a readable typed format.
2. Create `src/commands/niche/compare.ts` with command handlers that compare a baseline manifest and a candidate manifest, summarize benchmark differences, provider metadata quality, and release-policy deltas.
3. Patch `src/cli/program/register.niche.ts` to register the `inspect` and `compare` subcommands and document them in help output.
4. Create `src/cli/program/register.niche.inspect-compare.test.ts` covering registration, argument validation, and typed CLI output behavior.
5. Ensure the compare command can surface suite hashes, fixture versions, provider metadata quality, and promoted-monitor cadence defaults when present.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholder comments, TODO markers, or mock implementations.
- The inspect and compare flows must be read-only. They must not mutate manifests, releases, or stores.
- Output must surface governance-critical details clearly rather than hiding them in nested raw JSON blobs by default.
- Do not add UI surfaces in this prompt.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run `pnpm exec vitest run src/cli/program/register.niche.inspect-compare.test.ts` and fix all failures.
2. Run `pnpm lint` and fix all lint errors in touched files.
3. Run `pnpm build:strict-smoke` and ensure the repo still builds.
4. Manually run the niche inspect and compare help output and verify the new subcommands appear and behave read-only.
5. Once all checks pass, run: `scripts/committer "feat(cli): add niche inspect and compare commands" src/commands/niche/inspect.ts src/commands/niche/compare.ts src/cli/program/register.niche.ts src/cli/program/register.niche.inspect-compare.test.ts`
```

```markdown
**[Sprint 9.1: Production Hardening for NicheClaw Core]**

**Context:** We are on Sprint 9 of 10. All feature sprints for the NicheClaw core, benchmark lab, optimization plane, action policy, verifier gate, release engine, and CLI pilot are complete. Read `ARCHITECTURE.md` for full project context.

**Objective:** Perform a production-readiness audit of the new NicheClaw codepath covering error handling, determinism discipline, contamination safety, governance enforcement, and build stability. Fix all issues found.

**Actionable Tasks:**

1. Audit the entire `src/niche/` tree plus the patched OpenClaw seam files for error handling, deterministic behavior, schema validation, and explicit refusal states.
2. Verify all manifest, benchmark, release, and governance writes validate their schemas before persistence.
3. Verify benchmark invalidation, contamination controls, rights propagation, and replayability status are enforced and not merely logged.
4. Verify CLI commands fail loudly and clearly on invalid inputs, missing prerequisites, incompatible manifests, and non-ready niches.
5. Verify the runtime patches preserve normal OpenClaw behavior when NicheClaw mode is inactive.
6. Add or update any missing tests needed to harden the niche seam integrations and refusal paths.

**Strict Constraints:**

- Write 100% complete fixes. No TODO markers or deferred cleanups.
- Do not broaden scope into UI or additional features.
- Preserve backward compatibility with existing OpenClaw behavior outside the NicheClaw path.
- Treat silent fallback, hidden invalidation, or untracked drift as bugs.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Run the full targeted NicheClaw test set under `test/niche/` and fix all failures.
2. Run `pnpm lint` and fix all lint errors.
3. Run `pnpm build` and ensure the full repo still builds.
4. Run the smallest relevant existing OpenClaw tests covering the patched runtime seams and keep them green.
5. Once all checks pass, run: `scripts/committer "chore(niche): production hardening complete" ARCHITECTURE.md src/niche src/agents src/auto-reply src/commands src/cli test/niche`
```

```markdown
**[Sprint 9.2: NicheClaw PRD Compliance Audit & Final Verification]**

**Context:** This is the FINAL prompt. All NicheClaw feature sprints are complete and production hardening has been applied. Read `ARCHITECTURE.md` for project context.

**Objective:** Audit the implementation against `PRD.md`, confirm that `NICHECLAW_PRD_V3.md`, `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`, and `NICHECLAW_PRD_V3_1A_PATCH.md` are faithfully reflected in code, and autonomously patch any gaps until the implementation is compliant.

**Actionable Tasks:**

1. Read `PRD.md`, `ARCHITECTURE.md`, `NICHECLAW_PRD_V3.md`, `NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md`, and `NICHECLAW_PRD_V3_1A_PATCH.md`.
2. Extract every discrete requirement from those documents and categorize them into: schemas, stores, benchmark protocol, grader calibration, domain compiler, niche gym, action policy, optimizer plane, runtime wiring, verifier gate, release engine, governance, tuning adapters, pilot niche, and CLI control plane.
3. Scan the codebase requirement by requirement and print a compliance checklist showing `[PASS]`, `[FAIL]`, or `[PASS*]` for justified config-only exceptions.
4. For every `[FAIL]` item, implement the missing behavior completely, add or update tests, and rerun the audit.
5. Continue patching until the final report shows 100% PASS or clearly documented justified exceptions that are configuration-only rather than code gaps.

**Strict Constraints:**

- Write 100% complete, production-ready code. No placeholders, TODO markers, or fake implementations.
- Do not skip any requirement from the approved NicheClaw PRD set.
- Preserve existing OpenClaw behavior outside the NicheClaw path while closing gaps.
- If a requirement cannot be fully exercised without external services, implement the full code path and classify it as configuration-dependent rather than incomplete.

**Definition of Done & Autonomous Verification (CRITICAL):**

1. Print the final compliance checklist with 100% PASS or justified config-only exceptions.
2. Run the full NicheClaw-targeted test set and ensure all tests pass.
3. Run `pnpm lint` and ensure zero errors.
4. Run `pnpm build` and ensure the full repo builds successfully.
5. Manually exercise the niche CLI flow for `init`, `benchmark`, `optimize`, `release`, `inspect`, and `compare` on the repo/terminal/CI pilot and verify typed outputs.
6. Once all checks pass, run: `scripts/committer "audit(niche): verify PRD compliance and release readiness" PRD.md ARCHITECTURE.md src/niche src/agents src/auto-reply src/commands src/cli test/niche`
```
