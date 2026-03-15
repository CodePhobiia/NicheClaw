# NicheClaw Capacity Planning

## Store Growth Patterns

The NicheClaw store grows as you create programs, run benchmarks, persist traces, and store artifacts. Understanding growth patterns helps plan storage and maintenance.

### Subdirectory Growth

| Directory         | Growth Driver                                      | Typical Size per Entry |
| ----------------- | -------------------------------------------------- | ---------------------- |
| `programs/`       | One file per niche program                         | 1-5 KB                 |
| `domain-packs/`   | One file per compilation                           | 5-20 KB                |
| `manifests/`      | Baseline + candidate + source-access per cycle     | 2-10 KB each           |
| `benchmark-runs/` | One file per benchmark execution                   | 10-100 KB              |
| `traces/`         | One file per agent run with niche active           | 5-500 KB               |
| `artifacts/`      | Versioned tool schemas, prompt assets, graders     | 1-50 KB each           |
| `lineage/`        | Dependency edges per artifact                      | 1-5 KB                 |
| `releases/`       | Active stack state (single file, updated in place) | 5-50 KB                |
| `replay-bundles/` | Full run replay data                               | 50-500 KB each         |
| `event-log.jsonl` | One line per lifecycle event                       | ~200 bytes per event   |

### Growth Estimates

- **Low usage** (1-2 programs, weekly optimization): ~10 MB/month
- **Medium usage** (5-10 programs, daily benchmarks): ~100 MB/month
- **High usage** (20+ programs, continuous optimization): ~1 GB/month

The fastest-growing directories are typically `traces/`, `benchmark-runs/`, and `replay-bundles/`.

## Monitoring Store Size

Use the `getStoreStatistics()` function or gateway to inspect current store usage:

```typescript
import { getStoreStatistics } from "./src/niche/store/pruning.js";
const stats = getStoreStatistics();
console.log(
  `Total: ${stats.total_files} files, ${(stats.total_bytes / 1024 / 1024).toFixed(1)} MB`,
);
for (const sub of stats.subdirectories) {
  console.log(`  ${sub.name}: ${sub.file_count} files, ${(sub.total_bytes / 1024).toFixed(1)} KB`);
}
```

## Pruning Guidance

### Garbage Collection

Use the built-in GC command to identify and remove orphaned artifacts:

```bash
openclaw niche gc --preview   # See what would be removed
openclaw niche gc --execute   # Actually remove orphaned data
```

### Manual Pruning Targets

1. **Old traces.** Traces older than your retention window can be safely deleted. Sort by `wall_clock_start_at` and remove the oldest.

2. **Superseded benchmark results.** Once a candidate is promoted or rolled back, its benchmark results are historical. Keep the most recent N results per program.

3. **Event log rotation.** The `event-log.jsonl` file grows indefinitely. Rotate it periodically:

   ```bash
   mv event-log.jsonl event-log.$(date +%Y%m%d).jsonl
   ```

4. **Replay bundles.** These are the largest individual files. Delete bundles for runs you no longer need to replay.

### Retention Recommendations

| Data Type                  | Recommended Retention                 |
| -------------------------- | ------------------------------------- |
| Programs                   | Indefinite                            |
| Active compilation records | Keep current + 1 previous             |
| Manifests                  | Keep current + 2 previous per program |
| Benchmark results          | Last 30 days or last 50 per program   |
| Traces                     | Last 14 days                          |
| Replay bundles             | Last 7 days                           |
| Event log                  | Last 30 days                          |

## Performance Notes

- **Store reads are synchronous.** Large stores with thousands of files may cause noticeable latency on `list` operations. Keep file counts reasonable through pruning.
- **JSON parsing overhead.** Each file read involves a full JSON parse. Manifests and traces with large payloads add per-read latency.
- **Lock contention.** The active-stack-state file uses file-based locking. Under high concurrency, lock contention can cause brief delays. This is normal.
- **File system choice.** SSDs significantly improve store performance. NFS or network-mounted storage may introduce latency, especially for lock operations.
