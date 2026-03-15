---
summary: "Leading indicators, lagging indicators, and anti-metrics for NicheClaw adoption and quality."
title: "Success Metrics"
---

# NicheClaw Success Metrics

## Leading Indicators

Leading indicators predict future success. Track these weekly during alpha and beta.

| Metric                     | Description                                                 | Target                                 |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Programs created           | Number of niche programs stored via `niche create`          | Growing week-over-week                 |
| Compilations completed     | Number of successful `niche compile` runs                   | At least 1 per active program per week |
| Readiness pass rate        | Percentage of readiness checks that pass all gates          | Above 80%                              |
| Benchmark runs executed    | Number of `niche benchmark` completions (live or typed)     | Growing week-over-week                 |
| Feedback entries submitted | Number of `niche feedback` submissions                      | At least 1 per operator per stage      |
| Average feedback rating    | Mean rating across all feedback entries                     | 3.5/5 or higher                        |
| Time to first benchmark    | Wall-clock time from `niche init` to first benchmark result | Under 30 minutes                       |

## Lagging Indicators

Lagging indicators confirm that value has been delivered. Track these monthly.

| Metric                      | Description                                                            | Target                                        |
| --------------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| Release promotions          | Number of candidates promoted through the release gate                 | At least 1 per active program                 |
| Demonstrated lift           | Percentage of promotions where candidate outperforms baseline          | 100% (by design -- policy gates enforce this) |
| Active stacks in production | Number of promoted stacks serving live traffic                         | Growing month-over-month                      |
| Operator retention          | Percentage of operators who complete more than one full pipeline cycle | Above 60%                                     |
| Pipeline completion rate    | Percentage of started pipelines that reach the release stage           | Above 50%                                     |

## Anti-Metrics

Anti-metrics signal problems. Any sustained increase should trigger investigation.

| Anti-Metric                | Description                                                           | Threshold                                           |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| Rollback rate              | Percentage of promoted stacks that get rolled back                    | Below 10%                                           |
| Abandoned pipelines        | Pipelines that stall at a stage for more than 7 days without feedback | Below 30%                                           |
| Store corruption incidents | Number of times `niche verify` detects integrity issues               | Zero                                                |
| Contamination detections   | Benchmark results flagged for contamination                           | Below 5% (some is expected during early iterations) |
| Governance violations      | Releases that bypass policy gates or lack required approvals          | Zero                                                |
| Feedback rating below 2    | Number of feedback entries with rating 1 or 2                         | Below 10% of total entries                          |

## Measurement

Use `scripts/niche-metrics-report.ts` to generate a local metrics summary from the store:

```bash
bun scripts/niche-metrics-report.ts
```

This reports program count, benchmark results, active stacks, store size, and feedback volume. For trend analysis, run it periodically and compare outputs.
