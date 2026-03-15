# NicheClaw Runbooks

Operational runbooks for diagnosing and resolving NicheClaw issues in production.

## Runbooks

- [Benchmark Failed](/niche/runbooks/benchmark-failed) -- A benchmark run did not complete or produced unexpected results.
- [Rollback Triggered](/niche/runbooks/rollback-triggered) -- A candidate was automatically or manually rolled back.
- [Store Corrupted](/niche/runbooks/store-corrupted) -- Store files are missing, unreadable, or contain invalid JSON.
- [Compilation Failed](/niche/runbooks/compilation-failed) -- Source ingestion or domain compilation did not succeed.

## Quick Health Check

Run the health check endpoint via the gateway:

```
niche.health
```

Or programmatically:

```typescript
import { nicheHealthCheck } from "./src/niche/health.js";
const result = nicheHealthCheck();
console.log(result.status, result.checks);
```

## Event Log

All lifecycle events are appended to `event-log.jsonl` inside the niche store root. Query events via the `niche.events.list` gateway method or:

```typescript
import { readNicheEventLog } from "./src/niche/event-log.js";
const recent = readNicheEventLog({ limit: 50 });
```

## Metrics

In-process counters track promotions, rollbacks, benchmarks, and trace persistence. Query via `niche.metrics` gateway method.
