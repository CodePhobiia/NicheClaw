---
summary: "Frequently asked questions about NicheClaw: readiness, benchmarking, releases, governance, and common issues."
read_when:
  - You have a question about NicheClaw behavior
  - You are troubleshooting a NicheClaw issue
  - You want to understand NicheClaw design decisions
title: "FAQ"
---

# Frequently Asked Questions

## Readiness

### Why is my readiness status `not_ready` even though I added sources

Readiness is evaluated across 9 dimensions, not just source coverage. The `not_ready` status means at least one hard blocker exists. Run `openclaw niche readiness --program <id>` and check the `hard_blockers` array. The five hard blocker codes are:

- `insufficient_rights_to_use` - your sources lack required usage rights
- `benchmarkability_below_minimum_threshold` - the domain pack does not have enough benchmark seed specs
- `contradiction_rate_exceeds_hard_threshold` - your sources contain too many contradictions
- `tool_availability_inadequate_for_workflow` - required tools are not available
- `source_coverage_too_low_for_benchmarkable_domain_pack` - insufficient source material for the task families

The `recommended_next_actions` array in the report tells you what to fix first.

### What score do I need on each readiness dimension

There is no single threshold. Each dimension is scored 0-100 and the hard blocker codes map to specific dimensions. A dimension score below the hard threshold triggers a blocker. Scores above the threshold but below ideal produce warnings (status becomes `ready_with_warnings`). The exact thresholds depend on the Niche Program's risk class. See [Readiness Dimensions](/niche/reference/readiness-dimensions) for details.

### Can I skip readiness and go straight to benchmarking

No. The readiness gate is enforced before benchmark suite generation. Without a `ready` or `ready_with_warnings` status, the benchmark pipeline will reject the program. This is by design: benchmarking a program that lacks sufficient sources or tools would produce misleading results.

## Compilation and Domain Packs

### Why does compilation produce warnings about contradictory sources

The compiler cross-references source material and detects when two sources make conflicting claims about the same concept. A few contradictions produce warnings. If the contradiction rate exceeds the hard threshold, it becomes a readiness blocker. Fix contradictions by updating or removing the conflicting source, or by adding a domain constraint that clarifies which source takes precedence.

### Can I edit a Domain Pack directly

Domain Packs are produced by the compiler and should not be hand-edited in normal workflows. The compiler generates the ontology, task taxonomy, terminology map, constraints, tool contracts, evidence sources, failure taxonomy, verifier defaults, and benchmark seeds from your source descriptors. If you need to change the pack, update your sources and recompile. Direct edits bypass provenance tracking and may cause governance issues.

### What happens if I add new sources after compilation

Adding sources does not automatically update the Domain Pack. You must recompile. The compiler will produce a new Domain Pack version, new Source Access Manifest, and new Readiness Report. If the new sources change the benchmark seed specs, you will also need to regenerate the benchmark suite.

## Benchmarking

### Why was my benchmark result invalidated

Check the `invalidation_reasons` array on the benchmark result summary. Common causes:

- **Contamination detected**: training data overlapped with evaluation data
- **Suite hash mismatch**: the suite changed between when the arms were configured and when the benchmark ran
- **Grader conflict with blocking types**: multiple graders disagreed in a way flagged as promotion-blocking by the arbitration policy
- **Fixture version mismatch**: the fixture version at run time differs from the one in the suite metadata

### What is the difference between `offline_gold` and `live_shadow` benchmark modes

`offline_gold` runs against a fixed dataset with deterministic execution controls (frozen clocks, cold caches, deterministic seeds). It is the standard mode for promotion decisions. `live_shadow` runs against actual production traffic in parallel, but discards the candidate's output. It catches issues that fixed datasets miss, such as distribution shift. Use `offline_gold` for promotion gates and `live_shadow` for ongoing monitoring.

### Why do baseline and candidate need the same sampling config

The comparison must be apples-to-apples. If the baseline uses `temperature: 0` and the candidate uses `temperature: 0.7`, differences in output quality could be caused by the temperature change rather than the specialization. The manifest comparison enforces that execution invariants match so that the only variable is the specialization itself.

### How many benchmark cases do I need

There is no hard minimum enforced by the schema, but the statistical power of the paired delta depends on case count. With too few cases, the confidence interval will be wide and the release policy will likely reject promotion. The benchmark suite generation process uses the Domain Pack's task families and seed specs to produce cases. More seed specs and more task families lead to better coverage.

## Releases

### Why was my candidate rejected even though the mean delta is positive

A positive mean delta is necessary but not sufficient. The release policy also checks:

- **Confidence interval**: if the low bound of the confidence interval is negative, the improvement is not statistically significant
- **Governance issues**: grader calibration failures, evidence binding problems, or monitor configuration issues block promotion
- **Verifier metrics**: false veto rate, override rate, and cost/latency regression must be within thresholds
- **Required case kinds**: the promoted monitor specifies which case kinds must be present; missing kinds block promotion

Run `niche compare --json` and check both `release_policy` and `governance_issues`.

### What is the difference between `promoted`, `shadow`, `canary`, and `experimental` decisions

- `promoted` - the candidate replaces the baseline in production for all traffic
- `shadow` - the candidate runs in parallel but its output is not delivered; used for safe validation
- `canary` - a fraction of traffic is routed to the candidate; used for gradual rollout
- `experimental` - the candidate is deployed without full promotion guarantees; used for exploration
- `rejected` - the candidate did not meet the promotion bar

### Can I promote without benchmark evidence

No. The release policy requires at least one benchmark result record, verifier metrics, and a monitor definition to evaluate a promotion decision. This is a core governance guarantee: every promotion is backed by evidence.

## Governance

### What are data zones and why do they matter

Data zones (`train`, `dev`, `gold_eval`, `hidden_eval`, `shadow_only`, `quarantined`) partition your data by usage purpose. The key rule is that evaluation data (`gold_eval`, `hidden_eval`) must never appear in training data. If contamination is detected, the benchmark result is invalidated. The `quarantined` zone holds data with unresolved governance issues that cannot be used anywhere until resolved.

### Why was my source quarantined

Sources are quarantined for one of these reasons:

- `unclear_rights` - the source's usage rights are ambiguous
- `redaction_failed` - PII or sensitive data redaction did not complete successfully
- `contradictory_or_corrupted_source` - the source content is internally inconsistent or corrupted
- `missing_provenance` - the source lacks provenance metadata
- `overlap_with_eval` - the source overlaps with evaluation data

Resolve the issue and re-ingest the source to clear the quarantine.

### What does `provider_metadata_quality` mean for my comparison

Provider metadata quality indicates how precisely the model version is known:

- `exact_snapshot` - the model checkpoint is pinned; highest confidence
- `release_label_only` - only a version label is known (e.g., "gpt-4o"); the underlying model may change
- `proxy_resolved` - the version was resolved through a routing proxy
- `opaque_provider` - the provider does not expose version information

Lower quality does not block comparison but reduces confidence in reproducibility. If the underlying model changes between baseline and candidate runs, the comparison may not be meaningful.

## Runtime and Operations

### How does the active Niche Stack get resolved for a run

Resolution follows a priority chain:

1. **Session override**: the session explicitly selected a stack
2. **Route override**: the routing configuration specifies a stack for this route
3. **Agent default**: the agent-level default stack binding

The resolution source is recorded in every run trace so you can audit which path was taken.

### What happens during a rollback

When a promoted candidate is rolled back:

1. The active stack is reverted to the rollback target (the previous baseline)
2. All route overlays pointing to the rolled-back stack are cleared
3. A `candidate_rolled_back` lifecycle event is emitted with the reason and count of cleared overlays

Rollback is immediate. Runs that are in-flight at the time of rollback may complete against either stack depending on timing.

### Can I run multiple Niche Programs simultaneously

Yes. Each Niche Program is independent. They have separate Domain Packs, manifests, benchmarks, and release tracks. The active stack resolution is per-program. Multiple programs can coexist on the same gateway without interference.
