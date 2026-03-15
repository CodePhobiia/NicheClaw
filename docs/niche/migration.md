---
summary: "How to handle NicheClaw schema migrations, store layout changes, and breaking changes between versions."
read_when:
  - You are upgrading NicheClaw and need to migrate data
  - You want to understand NicheClaw schema versioning
  - You need to detect or handle breaking changes in NicheClaw artifacts
title: "Migration Guide"
---

# Migration Guide

NicheClaw schemas and store layout evolve between versions. This guide explains the versioning approach, how to detect breaking changes, the store directory layout, and manual migration procedures.

## Schema versioning approach

All NicheClaw schemas are defined using TypeBox (`@sinclair/typebox`) in `src/niche/schema/`. Every object schema uses `additionalProperties: false`, which means:

- Extra fields in a JSON file will cause validation failure
- Removed fields will cause validation failure
- Type changes (e.g., string to number) will cause validation failure

This strict validation means that any schema change that adds, removes, or changes a field is a breaking change for existing artifacts. There is no automatic migration: if the schema changes, old artifacts must be revalidated or regenerated.

### How schemas are versioned

NicheClaw does not use a separate schema version number. Schemas are versioned implicitly through the OpenClaw release. When you upgrade OpenClaw, the NicheClaw schemas may have changed. The content hash on every `ArtifactRef` provides integrity verification: if a stored artifact does not match its declared hash, it was modified outside the pipeline.

### TypeBox validation behavior

TypeBox schemas are compiled to JSON Schema at runtime. Validation is performed by `validateJsonSchemaValue` from the plugin schema validator. The validator returns structured errors with paths and messages, making it straightforward to identify which field failed validation.

## Store directory layout

NicheClaw stores all state under `~/.openclaw/niche/`. The directory structure is:

```
~/.openclaw/niche/
  programs/                    # NicheProgram JSON files
  domain-packs/                # DomainPack and compilation records
  manifests/
    baseline/                  # BaselineManifest files
    candidate/                 # CandidateManifest files
    source-access/             # SourceAccessManifest files
  readiness-reports/           # ReadinessReport files
  benchmark-suites/            # BenchmarkSuiteMetadata and cases
  benchmark-runs/              # BenchmarkResultRecord files
  traces/                      # RunTrace files
  replay-bundles/              # Replay bundles for deterministic replay
  artifacts/                   # Typed subdirectories
    domain_pack/
    run_trace/
    dataset/
    eval_case/
    episode_case/
    grader/
    reward/
    prompt_asset/
    retrieval_stack/
    verifier_pack/
    action_policy/
    candidate_recipe/
    student_model/
    release_bundle/
  lineage/                     # Lineage reference files
  releases/                    # CandidateRelease files + active-stack-state.json
  monitors/                    # PromotedReleaseMonitor files
  graders/                     # GraderArtifact and calibration records
  jobs/                        # Optimization and processing jobs
  audit/                       # Audit log entries
```

### Layout stability

The directory names are defined in `src/niche/constants.ts` as `NICHE_STATE_DIRNAMES`. The naming convention is stable: directory names use kebab-case and map to the logical store partition. However, the layout is not contractually frozen. New directories may be added in future versions.

### File naming conventions

- Program files: `{niche_program_id}.json`
- Manifest files: `{manifest_id}.json`
- Artifact files: `{version}--{content_hash}.json` within `artifacts/{artifact_type}/{artifact_id}/`
- Other files: `{record_id}.json`

## How to detect breaking changes

### Before upgrading

1. **Read the changelog.** Schema changes are documented as breaking changes in the OpenClaw changelog.

2. **Validate existing artifacts.** Run `niche inspect` on critical artifacts to confirm they pass current validation:

```bash
# Validate all baseline manifests
for f in ~/.openclaw/niche/manifests/baseline/*.json; do
  openclaw niche inspect --kind baseline_manifest --file "$f" || echo "FAILED: $f"
done
```

3. **Check schema diffs.** If upgrading across multiple versions, compare the schema files in `src/niche/schema/` between the two versions to understand what changed.

### After upgrading

1. **Re-validate critical artifacts.** Run the same inspection loop after upgrade. Files that now fail validation have been affected by schema changes.

2. **Check readiness.** Readiness reports may need regeneration if the readiness dimensions or thresholds changed:

```bash
openclaw niche readiness --program <program-id>
```

3. **Check active stack.** Verify the active stack state is still valid:

```bash
openclaw niche inspect --kind promoted_monitor --file ~/.openclaw/niche/releases/active-stack-state.json
```

## Manual migration procedures

### Regenerating a Domain Pack

If the `DomainPack` schema changed, recompile from source descriptors:

```bash
openclaw niche compile --program <program-id>
```

This produces a new Domain Pack, Source Access Manifest, and Readiness Report. Existing benchmark suites that reference the old pack will need regeneration.

### Regenerating manifests

If the `BaselineManifest` or `CandidateManifest` schema changed:

1. Create a new baseline manifest from the current Niche Program configuration
2. Create a new candidate manifest referencing the new baseline
3. Regenerate the benchmark suite
4. Run benchmarks against the new manifests

Old manifests remain in the store for audit purposes but will fail validation against the new schema.

### Migrating benchmark results

Benchmark results are immutable audit records. If the `BenchmarkResultRecord` schema changed, old results cannot be migrated. Instead:

1. Keep old results in place (they serve as historical records)
2. Run new benchmarks that produce results conforming to the new schema
3. Use the new results for promotion decisions

### Handling active stack state

The active stack state file (`releases/active-stack-state.json`) may need updating if the `ActiveNicheRuntimeState` schema changed:

1. Back up the current state file
2. If the gateway fails to load the state, clear it and re-activate the desired stack:

```bash
# Back up
cp ~/.openclaw/niche/releases/active-stack-state.json \
   ~/.openclaw/niche/releases/active-stack-state.json.bak

# Clear and re-activate (the specific command depends on your release workflow)
openclaw niche release --activate <release-id>
```

### Full store reset

As a last resort, you can regenerate the entire store from scratch:

1. Back up the existing store:

```bash
cp -r ~/.openclaw/niche ~/.openclaw/niche.bak
```

2. Remove the store:

```bash
rm -rf ~/.openclaw/niche
```

3. Re-run the full pipeline: create program, compile, achieve readiness, benchmark, and promote.

This is a destructive operation. All historical benchmark results, traces, and audit records will be lost. Only do this if migration is not feasible.

## Best practices

- **Pin your OpenClaw version** in production environments. Upgrade deliberately, not automatically.
- **Back up before upgrading.** A simple `cp -r ~/.openclaw/niche ~/.openclaw/niche.bak` protects against unexpected schema changes.
- **Use `niche inspect` as a health check.** Run it after upgrades to verify artifact validity.
- **Treat benchmark results as immutable.** Never modify them in place. If they fail validation after upgrade, run new benchmarks rather than trying to patch old results.
- **Monitor the changelog.** Schema changes are noted in the OpenClaw release notes. Plan migration windows accordingly.
