# Runbook: Benchmark Failed

## Symptoms

- A benchmark run ends with status `failed` or `error`.
- The `benchmark_case_finished` lifecycle event shows `invalidated: true`.
- The `niche benchmark` CLI command reports failures.

## Diagnosis Steps

1. **Check the benchmark result record.** Use `niche.benchmarks.get` with the record ID to inspect the full result, including per-case outcomes and error messages.

2. **Review the run trace.** If a trace was persisted, use `niche.traces.get` to see what happened during the run, including tool calls, model responses, and timing.

3. **Check the grader output.** Grader failures produce detailed error payloads in the benchmark result record's `case_results` array. Look for `grader_error` or `outcome: "fail"` entries.

4. **Verify the benchmark suite definition.** Ensure the benchmark suite referenced by the candidate manifest exists and has valid case definitions. Use `niche.readiness.get` to check whether the suite passes readiness checks.

5. **Check for invalidation.** The invalidation engine marks results as invalid when fixture versions or environment snapshots do not match. Check `invalidated` and `invalidation_reason` fields.

## Resolution

- **Grader error:** Fix the grader logic or update the grader set version in the candidate manifest.
- **Model regression:** If the candidate model underperforms the baseline, the benchmark is working as intended. Review whether the candidate should be promoted.
- **Fixture mismatch:** Re-run the benchmark with the correct fixture version. Use `niche benchmark --force` to override stale caches.
- **Timeout:** Increase the benchmark timeout in the suite definition or investigate slow model responses.

## Prevention

- Run readiness checks (`niche readiness`) before promoting candidates.
- Pin fixture versions in benchmark suite definitions.
- Monitor the `benchmarks_total` metric for unexpected drops.
