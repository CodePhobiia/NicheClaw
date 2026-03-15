## Plan: Launch Discipline Remediation (42/100 to 100/100)

### Summary of Findings

After thorough exploration, here is the current state:

1. **141 files fail `oxfmt` formatting** -- all niche source (`src/niche/`), test (`test/niche/`), CLI registration (`src/cli/program/register.niche*.ts`), UI views (`ui/src/ui/views/niche/`), commands (`src/commands/niche/`), and gateway methods (`src/gateway/server-methods/niche.ts`) are unformatted. Running `pnpm format` (`oxfmt --write`) will fix them in bulk.

2. **2 failing tests** in `test/niche/commands/benchmark-runtime.test.ts` -- this is a new (untracked) file. The test exercises `nicheBenchmarkCommand` with live runtime execution through mocked `agentCommand`. Failures need root-cause investigation at runtime.

3. **1 remaining `Type.Any()`** at `src/niche/schema/compile-record.ts:23` -- the field `compiled_domain_config` uses `Type.Optional(Type.Any())` but the actual type is `CompiledDomainConfig`, a well-defined interface in `src/niche/domain/compiled-config.ts`.

4. **No changelog entries** -- `CHANGELOG.md` has no mention of NicheClaw. The unreleased section needs entries under `### Changes`.

5. **CI already has a niche matrix entry** (`pnpm test:niche`) in the `checks` job, but there is no dedicated quality gate (format check, Type.Any ban, schema version assertion).

6. **No release checklist** -- `docs/reference/RELEASING.md` has no NicheClaw-specific section.

7. **No schema version tracking** -- none of the 15 schema files under `src/niche/schema/` carry a version field or migration strategy.

8. **No feature flag** -- `registerNicheCommands` in `src/cli/program/register.niche.ts` is always invoked; no config toggle exists.

9. **All modifications are uncommitted** -- the git status shows ~80 modified files and ~60 untracked files.

10. **No lint rule for `Type.Any`** -- the existing lint scripts under `scripts/check-*.mjs` follow a `callsite-guard` or custom pattern, but none target niche-specific TypeBox violations.

### Critical Files for Implementation

- `src/niche/schema/compile-record.ts` - Contains the last `Type.Any()` that must be replaced with a proper TypeBox schema
- `.github/workflows/ci.yml` - CI workflow that needs a dedicated niche quality gate job
- `src/cli/program/register.niche.ts` - CLI registration entry point where the feature flag gate must be added
- `CHANGELOG.md` - Needs NicheClaw changelog entries in the Unreleased section
- `test/niche/commands/benchmark-runtime.test.ts` - The 2 failing tests that must be fixed

---

Below is the full plan document content that should be written to `docs/plans/readiness-remediation/10-launch-discipline.md`:

---

# Launch Discipline Remediation Plan

> **Dimension:** Launch Discipline
> **Current Score:** 42/100
> **Target Score:** 100/100
> **Scope:** All niche source, test, schema, CLI, UI, and CI files

**Goal:** Close all 10 launch-discipline gaps so that NicheClaw passes `pnpm check`, has zero test failures, zero `Type.Any()` usage, full changelog coverage, a dedicated CI gate, a release checklist, schema versioning, a feature-flag mechanism, clean git state, and a lint guardrail preventing regressions.

**Tech Stack:** TypeScript (ESM), Vitest, TypeBox, oxfmt, oxlint, GitHub Actions, Commander.js

**Test command:** `pnpm test:niche`
**Format command:** `pnpm format` (fix) / `pnpm format:check` (verify)
**Check command:** `pnpm check`
**Build command:** `pnpm build`

---

## LD-01: Fix oxfmt Formatting (141 files)

**Priority:** P0 (blocks `pnpm check` which blocks CI merge)
**Effort:** Low (automated)

**Files:**

- All files under `src/niche/`, `test/niche/`, `src/commands/niche/`, `src/cli/program/register.niche*.ts`, `ui/src/ui/views/niche/`, `ui/src/ui/controllers/niche.ts`, `src/gateway/server-methods/niche.ts`, `vitest.niche.config.ts`, `scripts/niche-backfill-teacher-rollout-authority.ts`

**Steps:**

1. Run `pnpm format` from repo root. This invokes `oxfmt --write` which respects `.oxfmtrc.jsonc` configuration (tab width 2, no tabs, sorted imports).
2. Verify with `pnpm format:check` (must exit 0).
3. Run `pnpm test:niche` to confirm formatting did not break any test assertions that depend on string literals or snapshots.
4. Commit formatting-only changes in a single commit: `style(niche): format all niche files with oxfmt`

**Verification:** `pnpm check` passes the `format:check` step.

---

## LD-02: Fix 2 Failing Tests in benchmark-runtime.test.ts

**Priority:** P0 (test suite must be green)
**Effort:** Medium

**Files:**

- `test/niche/commands/benchmark-runtime.test.ts`
- `src/niche/benchmark/live-benchmark.ts`
- `src/niche/benchmark/record-bindings.ts`
- `src/niche/store/benchmark-run-store.ts`

**Steps:**

1. Run `pnpm test:niche -- --reporter verbose test/niche/commands/benchmark-runtime.test.ts` and capture the exact failure output.
2. Root-cause the failures. The two tests ("executes benchmark arms through the real runtime substrate and persists durable evidence" and "executes live episode benchmarks through the runtime substrate") exercise the full `nicheBenchmarkCommand` with a mocked `agentCommand`. Likely causes: (a) a store function signature changed during audit remediation but the test fixture was not updated, (b) the `live-benchmark.ts` execution path expects a field or store record that the mock does not produce, (c) the `record-bindings.ts` bindings assume a benchmark-run-store shape that was modified.
3. Fix the root cause in the minimal set of files (prefer fixing the source if the test expectations are correct, or fixing the test if the expectations are stale).
4. Run the full niche suite: `pnpm test:niche` -- all tests must pass.
5. Commit: `fix(niche): resolve 2 benchmark-runtime test failures`

**Verification:** `pnpm test:niche` exits 0 with zero failures and zero skips.

---

## LD-03: Replace Type.Any() with Proper TypeBox Schema

**Priority:** P0 (type safety requirement, prevents `any` leak into runtime validation)
**Effort:** Low

**Files:**

- Modify: `src/niche/schema/compile-record.ts` (line 23)
- Reference: `src/niche/domain/compiled-config.ts` (the `CompiledDomainConfig` type definition)

**Steps:**

1. In `src/niche/schema/compile-record.ts`, replace `Type.Optional(Type.Any())` at line 23 with a proper TypeBox schema. The `CompiledDomainConfig` type (defined in `src/niche/domain/compiled-config.ts`) has this shape:

   ```
   { niche_program_id: string, domain_pack_id: string, version: string,
     compiled_at: string, planner: PlannerDirectives, tools: ToolDirective[],
     observation: ObservationDirective, retrieval: RetrievalDirective,
     exemplars: ExemplarDirective[], constraints: ConstraintEnforcementDirective[] }
   ```

   However, following the tool-schema guardrails in CLAUDE.md ("avoid `Type.Union` in tool input schemas; no `anyOf`/`oneOf`/`allOf`"), the schema must use `Type.Object` with explicit properties. Create a `CompiledDomainConfigSchema` either inline or in a new export from `compiled-config.ts`, then reference it as `Type.Optional(CompiledDomainConfigSchema)`.

2. Because this field is `Optional` and the schema uses `additionalProperties: false`, the replacement must accurately reflect all fields. Define sub-schemas for `PlannerDirectives`, `ToolDirective`, `ObservationDirective`, `RetrievalDirective`, `ExemplarDirective`, and `ConstraintEnforcementDirective` as TypeBox `Type.Object` definitions. Use `NonEmptyString` and `IdentifierString` from `./common.js` where appropriate.

3. Alternative simpler approach: since this is an optional metadata field stored alongside the compilation record and not used for runtime validation gating, use `Type.Optional(Type.Record(Type.String(), Type.Unknown()))` as a transitional step. This removes `Type.Any()` while preserving flexibility. The field will still accept the `CompiledDomainConfig` object. Add a code comment noting the full schema should be tightened in a follow-up.

4. Run `pnpm tsgo` to verify type-check passes.
5. Run `pnpm test:niche` to verify no test regressions.
6. Run `grep -r "Type.Any" src/niche/` to confirm zero remaining instances.
7. Commit: `fix(niche): replace Type.Any with typed schema in compile-record`

**Verification:** `grep -r "Type.Any" src/niche/` returns no results. `pnpm tsgo` passes.

---

## LD-04: Add NicheClaw Changelog Entries

**Priority:** P1 (required before release)
**Effort:** Low

**Files:**

- Modify: `CHANGELOG.md`

**Steps:**

1. In the `## Unreleased` section of `CHANGELOG.md`, add entries under `### Changes`. Per CLAUDE.md guidance, append new entries to the end of the section (do not insert at the top).

2. Entries to add (user-facing features only, concise, action-oriented):
   - `NicheClaw: add agent specialization framework with CLI commands for creating niche programs, compiling domain packs, running readiness checks, preparing seeded runtime runs, executing benchmarks, comparing results, releasing candidates, and optimizing specializations (openclaw niche).`
   - `NicheClaw/runtime: add active-stack resolution, planner injection, tool ranking, constraint enforcement, observation processing, repair guidance, and verifier gating for domain-specialized agent runs.`
   - `NicheClaw/benchmark: add live and offline benchmark execution with atomic and episode case runners, grader registry, contamination detection, and paired delta arbitration.`
   - `NicheClaw/release: add promotion controller, rights revocation, drift monitoring, and invalidation planning for governed candidate releases.`
   - `NicheClaw/optimizer: add candidate generation, data synthesis, reward registry, tuning adapters, and continuous optimization loop.`
   - `NicheClaw/UI: add niche programs, benchmarks, and runtime dashboard views to the gateway control UI.`

3. Commit: `docs(niche): add NicheClaw changelog entries`

**Verification:** `grep -i niche CHANGELOG.md` returns the new entries.

---

## LD-05: Add Dedicated Niche CI Quality Gate

**Priority:** P1 (CI enforcement for niche-specific quality bars)
**Effort:** Medium

**Files:**

- Modify: `.github/workflows/ci.yml`
- Reference: `vitest.niche.config.ts`

**Steps:**

1. The existing CI already runs `pnpm test:niche` as a matrix entry under the `checks` job (line 153-155). This covers test execution. However, it does not enforce niche-specific quality checks.

2. Add a new matrix entry to the `checks` job:

   ```yaml
   - runtime: node
     task: niche-quality
     command: >-
       node -e "
         const fs = require('fs');
         const files = fs.readdirSync('src/niche/schema', {recursive: true}).filter(f => f.endsWith('.ts'));
         let found = false;
         for (const f of files) {
           const content = fs.readFileSync('src/niche/schema/' + f, 'utf8');
           if (content.includes('Type.Any(')) { console.error('Type.Any found in src/niche/schema/' + f); found = true; }
         }
         if (found) process.exit(1);
         console.log('No Type.Any found in niche schemas.');
       "
   ```

   Alternatively, create a dedicated script `scripts/check-niche-type-any.mjs` (see LD-10) and reference it here.

3. The `pnpm check` job already runs `format:check` and `tsgo` and `lint` on all source, which covers niche files. So format enforcement is already gated by CI once LD-01 is done.

4. Commit: `ci(niche): add niche-specific quality gate to CI matrix`

**Verification:** A PR that introduces `Type.Any()` in `src/niche/schema/` will fail the niche-quality CI step.

---

## LD-06: Add NicheClaw Release Checklist

**Priority:** P1 (operational readiness)
**Effort:** Low

**Files:**

- Create: `docs/reference/niche-release-checklist.md`
- Modify: `docs/reference/RELEASING.md` (add cross-reference)

**Steps:**

1. Create `docs/reference/niche-release-checklist.md` with the following sections:
   - **Pre-release validation:** `pnpm test:niche` passes, `pnpm check` passes, `grep -r "Type.Any" src/niche/schema/` returns nothing, `grep -r "@ts-ignore\|@ts-nocheck" src/niche/ test/niche/` returns nothing.
   - **Schema version check:** verify `NICHE_SCHEMA_VERSION` in `src/niche/schema/common.ts` matches the intended release version.
   - **Store migration check:** if schema version was bumped, verify migration path is documented and tested.
   - **Feature flag check:** verify `niche.enabled` config flag behavior is tested (feature is gated in non-dev builds if still in beta).
   - **Changelog check:** verify `CHANGELOG.md` has NicheClaw entries for all user-facing changes.
   - **Benchmark regression check:** run `pnpm test:niche` on a clean checkout to confirm no environment-dependent failures.
   - **E2E pipeline check:** run `test/niche/e2e/full-pipeline.test.ts` and `test/niche/e2e/specialization-proof.test.ts`.

2. In `docs/reference/RELEASING.md`, add a line after the general pre-release checks: `- [ ] Run NicheClaw release checklist: see [niche-release-checklist.md](niche-release-checklist.md).`

3. Commit: `docs(niche): add NicheClaw release checklist`

**Verification:** File exists and is cross-referenced from RELEASING.md.

---

## LD-07: Add Schema Version Tracking

**Priority:** P1 (migration safety, forward compatibility)
**Effort:** Medium

**Files:**

- Modify: `src/niche/schema/common.ts`
- Modify: `src/niche/store/paths.ts`
- Modify: `src/niche/store/index.ts` (or relevant store entry points)
- Create: `test/niche/schema/version-migration.test.ts`

**Steps:**

1. In `src/niche/schema/common.ts`, add a schema version constant:

   ```typescript
   export const NICHE_SCHEMA_VERSION = "1.0.0";
   ```

   This follows semver: major bumps for breaking schema changes (field removal, type change), minor for additive changes (new optional fields), patch for documentation-only changes.

2. In `src/niche/store/paths.ts`, add a version metadata path function that writes schema version alongside each stored record's directory (e.g., `<state-root>/niche/.schema-version` containing `{"version":"1.0.0","written_at":"..."}`).

3. In store entry points (`src/niche/store/index.ts` re-exports), add a `validateNicheSchemaVersion(env)` function that reads the stored `.schema-version` file and compares it against `NICHE_SCHEMA_VERSION`. On mismatch: if stored version is older, log a migration warning; if stored version is newer, throw an error (prevent downgrade corruption).

4. Wire `validateNicheSchemaVersion` into `registerNicheCommands` as an early check before any niche command executes, or into each command's entry point.

5. Write `test/niche/schema/version-migration.test.ts` with:
   - Test that `NICHE_SCHEMA_VERSION` matches expected format.
   - Test that `validateNicheSchemaVersion` passes when versions match.
   - Test that `validateNicheSchemaVersion` warns on forward-compatible (minor) mismatch.
   - Test that `validateNicheSchemaVersion` throws on major mismatch.

6. Commit: `feat(niche): add schema version tracking and migration validation`

**Verification:** `NICHE_SCHEMA_VERSION` exists, `pnpm test:niche` passes, and the store writes a `.schema-version` file.

---

## LD-08: Add Feature Flag / Gradual Rollout Mechanism

**Priority:** P1 (safe progressive rollout)
**Effort:** Medium

**Files:**

- Modify: `src/cli/program/register.niche.ts` (gate command registration)
- Modify: `src/config/types.base.ts` (add config field)
- Modify: `src/config/schema.labels.ts` (add label)
- Modify: `src/config/schema.help.ts` (add help text)
- Create: `test/niche/commands/feature-flag.test.ts`

**Steps:**

1. Following the existing pattern for ACP (which uses `acp.enabled` as a boolean gate), add a `niche.enabled` config field. In `src/config/types.base.ts`, add to the config type:

   ```typescript
   niche?: {
     enabled?: boolean;
   };
   ```

2. In `src/config/schema.labels.ts`, add:

   ```typescript
   "niche": "NicheClaw",
   "niche.enabled": "NicheClaw Enabled",
   ```

3. In `src/config/schema.help.ts`, add:

   ```typescript
   "niche": "NicheClaw specialization framework controls. Enable to expose niche CLI commands and runtime integration.",
   "niche.enabled": "Global NicheClaw feature gate. When false (default), niche CLI commands are hidden and niche runtime integration is inactive. Set true to enable the specialization pipeline.",
   ```

4. In `src/cli/program/register.niche.ts`, modify `registerNicheCommands` to accept a config parameter and early-return when `config.niche?.enabled !== true`:

   ```typescript
   export function registerNicheCommands(
     program: Command,
     config?: { niche?: { enabled?: boolean } },
   ) {
     if (config?.niche?.enabled !== true) {
       return;
     }
     // ... existing registration code
   }
   ```

   Alternatively, always register but mark the niche command as hidden (`niche.command("niche").hidden()`) when disabled, so `--help` does not expose it but it remains callable for developers.

5. Write `test/niche/commands/feature-flag.test.ts`:
   - Test that niche commands register when `niche.enabled` is true.
   - Test that niche commands are hidden/absent when `niche.enabled` is false or unset.

6. Commit: `feat(niche): add config-based feature flag for NicheClaw commands`

**Verification:** With `niche.enabled: false` (default), `openclaw --help` does not show `niche` subcommand. With `niche.enabled: true`, it appears.

---

## LD-09: Commit All Working Tree Changes

**Priority:** P0 (all work must be committed for CI and review)
**Effort:** Low

**Steps:**

1. After all preceding items (LD-01 through LD-08) are implemented, stage and commit in logical groups:
   - Formatting commit (LD-01): all oxfmt changes
   - Test fix commit (LD-02): benchmark-runtime test fixes
   - Type safety commit (LD-03): Type.Any replacement
   - Changelog commit (LD-04): CHANGELOG.md
   - CI commit (LD-05): ci.yml changes
   - Docs commit (LD-06): release checklist
   - Schema version commit (LD-07): version tracking
   - Feature flag commit (LD-08): config gate
   - Lint rule commit (LD-10): Type.Any ban script

2. Each commit follows the repo convention: concise, action-oriented, prefixed with scope (e.g., `fix(niche):`, `feat(niche):`, `ci(niche):`, `docs(niche):`, `style(niche):`).

3. After all commits, run the full validation suite:
   ```
   pnpm check && pnpm test:niche && pnpm build
   ```

**Verification:** `git status` shows a clean working tree. `git log --oneline -15` shows all commits. CI pipeline passes on push.

---

## LD-10: Add Lint Rule Banning Type.Any in Niche Schemas

**Priority:** P2 (regression prevention)
**Effort:** Low

**Files:**

- Create: `scripts/check-niche-no-type-any.mjs`
- Modify: `package.json` (add script entry)
- Modify: `package.json` `check` script (add to pipeline)

**Steps:**

1. Create `scripts/check-niche-no-type-any.mjs` following the existing `callsite-guard` pattern (see `scripts/check-no-register-http-handler.mjs` and `scripts/lib/callsite-guard.mjs`):

   ```javascript
   #!/usr/bin/env node
   import ts from "typescript";
   import { runCallsiteGuard } from "./lib/callsite-guard.mjs";
   import { runAsScript, toLine, unwrapExpression } from "./lib/ts-guard-utils.mjs";

   const sourceRoots = ["src/niche"];

   function isTypeAnyCall(expression) {
     const callee = unwrapExpression(expression);
     return (
       ts.isPropertyAccessExpression(callee) &&
       callee.name.text === "Any" &&
       ts.isIdentifier(callee.expression) &&
       callee.expression.text === "Type"
     );
   }

   export function findTypeAnyLines(content, fileName = "source.ts") {
     const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
     const lines = [];
     const visit = (node) => {
       if (ts.isCallExpression(node) && isTypeAnyCall(node.expression)) {
         lines.push(toLine(sourceFile, node.expression));
       }
       ts.forEachChild(node, visit);
     };
     visit(sourceFile);
     return lines;
   }

   export async function main() {
     await runCallsiteGuard({
       importMetaUrl: import.meta.url,
       sourceRoots,
       findCallLines: findTypeAnyLines,
       header: "\nType.Any() is banned in niche schema code. Use explicit TypeBox schemas.\n",
     });
   }

   runAsScript(main, import.meta.url);
   ```

2. In `package.json`, add script:

   ```json
   "lint:niche:no-type-any": "node scripts/check-niche-no-type-any.mjs"
   ```

3. In `package.json`, append to the `check` script chain:

   ```
   && pnpm lint:niche:no-type-any
   ```

4. Run `pnpm lint:niche:no-type-any` to verify it passes (after LD-03 is done).

5. Commit: `chore(niche): add lint rule banning Type.Any in niche schemas`

**Verification:** Introducing `Type.Any()` in any file under `src/niche/` causes `pnpm check` to fail.

---

## Sequencing

| Order | Item  | Depends On | Parallelizable                  |
| ----- | ----- | ---------- | ------------------------------- |
| 1     | LD-01 | None       | No (must be first, unblocks CI) |
| 2     | LD-02 | LD-01      | Yes (with LD-03)                |
| 2     | LD-03 | LD-01      | Yes (with LD-02)                |
| 3     | LD-10 | LD-03      | Yes (with LD-04..LD-08)         |
| 3     | LD-04 | None       | Yes                             |
| 3     | LD-05 | LD-10      | No (references lint script)     |
| 3     | LD-06 | None       | Yes                             |
| 3     | LD-07 | None       | Yes                             |
| 3     | LD-08 | None       | Yes                             |
| 4     | LD-09 | All above  | No (final)                      |

---

## Scoring Breakdown (Target: 100/100)

| Gap               | Weight  | Current | Target  | Item                             |
| ----------------- | ------- | ------- | ------- | -------------------------------- |
| oxfmt formatting  | 20      | 0       | 20      | LD-01                            |
| Test failures     | 15      | 0       | 15      | LD-02                            |
| Type.Any removal  | 10      | 0       | 10      | LD-03                            |
| Changelog entries | 10      | 0       | 10      | LD-04                            |
| Dedicated CI gate | 10      | 0       | 10      | LD-05                            |
| Release checklist | 8       | 0       | 8       | LD-06                            |
| Schema versioning | 8       | 0       | 8       | LD-07                            |
| Feature flag      | 7       | 0       | 7       | LD-08                            |
| Clean git state   | 7       | 0       | 7       | LD-09                            |
| Lint guardrail    | 5       | 0       | 5       | LD-10                            |
| **Existing**      | **42**  | **42**  | **42**  | Build, types, no TODOs, no skips |
| **Total**         | **100** | **42**  | **100** |                                  |

### Critical Files for Implementation

- `src/niche/schema/compile-record.ts` - Contains the sole `Type.Any()` that must be replaced with a proper TypeBox schema for `CompiledDomainConfig`
- `.github/workflows/ci.yml` - Existing CI workflow where the dedicated niche quality gate must be added as a matrix entry
- `src/cli/program/register.niche.ts` - CLI command registration entry point that needs the feature flag gate
- `CHANGELOG.md` - Root changelog needing NicheClaw feature entries in the Unreleased section
- `test/niche/commands/benchmark-runtime.test.ts` - The 2 failing tests requiring root-cause analysis and fix
