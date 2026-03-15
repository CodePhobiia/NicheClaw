---
summary: "Problem/solution pairs for common NicheClaw errors, organized by workflow stage."
read_when:
  - You encounter an error from a NicheClaw CLI command
  - A readiness report shows blockers or unexpected scores
  - Schema validation fails on a NicheClaw artifact
title: "Troubleshooting"
---

# Troubleshooting

This page lists common NicheClaw errors with their root causes and solutions. Errors are grouped by the workflow stage where they typically appear.

## Initialization Errors

### Missing or invalid NicheClaw architecture anchor: PRD.md

**Error message:**

```
Missing or invalid NicheClaw architecture anchor: PRD.md (/path/to/repo/PRD.md).
```

**Cause:** The `openclaw niche init` command requires both `PRD.md` and `ARCHITECTURE.md` to exist in the repository root and to mention "NicheClaw" (case-insensitive match).

**Solution:** Create the missing file in the repository root with content that references NicheClaw:

```bash
echo "# PRD\n\nThis project uses NicheClaw for governed agent specialization." > PRD.md
```

Do the same for `ARCHITECTURE.md` if it is also missing or does not mention NicheClaw.

### Missing or invalid NicheClaw architecture anchor: ARCHITECTURE.md

Same as above. Create `ARCHITECTURE.md` with NicheClaw content.

### Refusing to overwrite existing starter program

**Error message:**

```
Refusing to overwrite existing starter program: /path/to/programs/repo-ci-specialist.json
```

**Cause:** Running `openclaw niche init --write-starter-program` when a program file already exists at the target path.

**Solution:** Either delete the existing starter program file, or use `openclaw niche create --program ./your-program.json` to store a different program.

---

## Program Creation Errors

### Missing niche program

**Error message:**

```
No stored niche program found for id: <id>
```

**Cause:** The compile, readiness, benchmark, or other commands reference a niche program ID that has not been stored.

**Solution:**

1. Run `openclaw niche list` to see what programs exist.
2. Either use a correct program ID, or store the program first:

```bash
openclaw niche create --program ./niche-program.json
```

### Invalid starter niche program

**Error message:**

```
Invalid starter niche program: <validation details>
```

**Cause:** The starter program built by `init --write-starter-program` failed schema validation. This can happen if `--starter-program-id` contains characters not allowed by the `IdentifierString` pattern.

**Solution:** Ensure the program ID matches the pattern `^[a-z0-9]+(?:[._-][a-z0-9]+)*$`. No uppercase letters, no spaces, no leading dots or hyphens.

---

## Compilation Errors

### At least one source descriptor is required

**Error message:**

```
At least one source descriptor is required to compile a niche.
```

**Cause:** The compile command was run without any `--source` flags, or all provided source files resulted in zero normalized sources.

**Solution:** Pass at least one valid source descriptor JSON file:

```bash
openclaw niche compile \
  --niche-program-id repo-ci-specialist \
  --source ./sources/repo-source.json
```

### rights_to_store is false

**Error message:**

```
Source <sourceId> cannot be compiled because rights_to_store is false.
```

**Cause:** A source descriptor has `rights.rights_to_store` set to `false`. Sources must have storage rights to be compiled.

**Solution:** Edit the source descriptor JSON and set `rights_to_store` to `true`:

```json
{
  "rights": {
    "rights_to_store": true,
    ...
  }
}
```

If the source genuinely cannot be stored, it cannot be used in compilation.

### Source is quarantined

**Error message:**

```
Source <sourceId> is quarantined and cannot be compiled.
```

**Cause:** A source descriptor's governed data status has `quarantined: true`.

**Solution:** Either resolve the quarantine reason and set `quarantined` to `false`, or remove the source from the compile command. Common quarantine reasons: `unclear_rights`, `redaction_failed`, `contradictory_or_corrupted_source`, `missing_provenance`, `overlap_with_eval`.

### Source cannot be compiled from data zone

**Error message:**

```
Source <sourceId> cannot be compiled from data zone <zone>.
```

**Cause:** Sources used in compilation must have `data_zone` set to `train` or `dev`. Other zones (`gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`) are not allowed.

**Solution:** Change the source's `data_zone` to `train` or `dev`, or use the source only in benchmark suites (not compilation).

### inputKind must be one of...

**Error message:**

```
inputKind must be one of: local_file, repo_asset, structured_text, benchmark_seed
```

**Cause:** The `inputKind` field in a source descriptor does not match one of the four recognized values.

**Solution:** Fix the `inputKind` field to one of:

- `local_file` -- for files on disk (requires `filePath`)
- `repo_asset` -- for files relative to a repository root (requires `repoRoot` and `repoRelativePath`)
- `structured_text` -- for inline text content (requires `text`)
- `benchmark_seed` -- for benchmark seed inputs (requires `prompt`, `taskFamilyId`, `passConditions`, `hardFailConditions`)

---

## Readiness Errors

### The niche is not ready

**Error message:**

```
The niche is not ready for specialization.
```

**Cause:** The readiness report status is `not_ready` due to one or more hard blockers.

**Solution:** Run the readiness command to identify blockers:

```bash
openclaw niche readiness --niche-program-id <id> --json
```

Check the `hard_blockers` array. Common blockers and fixes:

| Blocker                                                 | Fix                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `insufficient_rights_to_use`                            | Ensure all sources have `rights_to_store: true` and `rights_to_benchmark: true`. |
| `benchmarkability_below_minimum_threshold`              | Add at least 2 benchmark seed source descriptors.                                |
| `contradiction_rate_exceeds_hard_threshold`             | Resolve conflicting metadata between sources with overlapping content.           |
| `tool_availability_inadequate_for_workflow`             | Add more tools to the niche program's `allowed_tools`. At least 2 needed.        |
| `source_coverage_too_low_for_benchmarkable_domain_pack` | Provide sources from at least 3 distinct source kinds.                           |

See [Readiness Dimensions Reference](/niche/reference/readiness-dimensions) for detailed score formulas and thresholds.

### Missing readiness report

**Error message:**

```
No readiness report found for niche program: <id>
```

**Cause:** The readiness command was run before compile, or the compile flow did not complete successfully.

**Solution:** Run compile first:

```bash
openclaw niche compile \
  --niche-program-id <id> \
  --source ./source1.json \
  --source ./source2.json
```

The compile command generates the readiness report automatically.

---

## Manifest Comparison Errors

### Baseline and candidate must use the same X

**Error message pattern:**

```
Baseline and candidate must use the same <field> for comparison.
```

**Cause:** The baseline and candidate manifests differ on an execution invariant field. Valid benchmark comparison requires that both manifests use identical values for all invariant fields.

**Fields that must match:**

- `benchmark_suite_id`
- `source_access_manifest_id`
- `provider` (unless cross-model experiment)
- `model_id` (unless cross-model experiment)
- `planner_runtime.component_id` (unless cross-model experiment)
- `api_mode`
- `sampling_config`
- `retry_policy`
- `token_budget`
- `context_budget`
- `execution_mode`
- `grader_set_version`
- `routing_proxy_version`
- `tool_catalog_version`
- `tool_allowlist`
- `tool_contract_version`
- `retrieval_config`
- `verifier_config`

**Solution:**

1. Use the `compare` command to see all mismatches:

```bash
openclaw niche compare \
  --baseline-manifest ./baseline.json \
  --candidate-manifest ./candidate.json
```

2. Regenerate manifests from the same compilation to ensure consistency:

```bash
openclaw niche compile \
  --niche-program-id <id> \
  --source ./sources/*.json \
  --emit-manifests
```

3. If intentionally comparing across models, some commands accept `--allow-cross-model-experiment`.

---

## Schema Validation Errors

### Common validation patterns

NicheClaw uses strict schema validation (`additionalProperties: false`) for all artifacts. Common validation errors:

**Extra fields:**

```
Invalid <artifact>: must NOT have additional properties
```

Remove any fields not defined in the schema. See [Artifact Formats Reference](/niche/reference/artifact-formats) for the exact field list.

**Missing required fields:**

```
Invalid <artifact>: must have required property '<field>'
```

Add the missing field with a valid value.

**Invalid identifier format:**

```
must match pattern "^[a-z0-9]+(?:[._-][a-z0-9]+)*$"
```

Identifiers must be lowercase alphanumeric with separators (`-`, `.`, `_`). No uppercase, no spaces, no leading/trailing separators.

**Invalid timestamp format:**

```
must match pattern "^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$"
```

Timestamps must be ISO 8601 UTC, for example: `2026-03-14T12:00:00.000Z`. The trailing `Z` is required.

**Invalid hash format:**

```
must match pattern "^[A-Fa-f0-9]{32,128}$"
```

Hash strings must be 32-128 hexadecimal characters.

**Empty array where minItems is 1:**

```
must NOT have fewer than 1 items
```

Arrays like `allowed_tools`, `success_metrics`, `allowed_sources`, `benchmark_seed_specs`, and others require at least 1 item.

---

## Inspect and Compare Errors

### Unsupported inspect kind

**Error message:**

```
Unsupported inspect kind "<kind>". Expected one of: baseline_manifest, candidate_manifest,
source_access_manifest, candidate_recipe, artifact, promoted_monitor.
```

**Solution:** Use one of the supported kinds. Hyphens are normalized to underscores, so `baseline-manifest` also works.

---

## Benchmark Errors

### Benchmark suite hash mismatch

**Cause:** The actual suite hash at execution time does not match the declared suite hash in the manifest.

**Solution:** Regenerate the benchmark suite, or pass `--actual-suite-hash` to record the observed hash.

### Contamination detected

**Cause:** The benchmark input was flagged as contaminated (either by explicit `--contamination-detected` flag or by audit).

**Solution:** Investigate data leakage between training and evaluation sets. Regenerate evaluation cases from uncontaminated sources.

---

## Optimization Errors

### Unsupported job type

**Cause:** The `--job-type` flag does not match a recognized type.

**Solution:** Use one of: `candidate_generation`, `teacher_rollout`, `verifier_refresh`, `evaluation_preparation`.

---

## Release Errors

### Promotion rejected

**Cause:** The release policy engine determined the candidate does not meet promotion criteria. Common reasons include negative mean deltas, high hard-fail rates, or unresolved arbitration conflicts.

**Solution:** Review the release command JSON output for the `decision_reason` field. Run additional benchmarks or adjust the candidate recipe.

---

## General Tips

1. Always use `--json` when debugging to get structured output with full error details.
2. Use `openclaw niche next --niche-program-id <id>` to see what step to run next.
3. Use `openclaw niche status` for a dashboard of all programs and their lifecycle state.
4. Use `openclaw niche inspect --kind <kind> --file <path>` to validate individual artifacts.
5. Run `openclaw niche pipeline` to automate multi-stage workflows with artifact bridging.
