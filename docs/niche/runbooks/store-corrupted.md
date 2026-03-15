# Runbook: Store Corrupted

## Symptoms

- The `niche.health` endpoint returns `degraded` or `unhealthy`.
- JSON parse errors when reading store files.
- Missing expected files (programs, manifests, benchmark results).
- The health check reports `active_stack_state_valid: false`.

## Diagnosis Steps

1. **Run the health check.** Use `niche.health` to get an overview of store integrity. Check each failing check's `message` field.

2. **Identify the corrupt file.** Common corruption targets:
   - `active-stack-state.json` -- Runtime state for stack resolution.
   - Program JSON files in the `programs/` directory.
   - Manifest files in the `manifests/` directory.

3. **Check for atomic-write recovery.** The JSON file writer uses `.tmp` sidecar files. If a `.tmp` file exists alongside a corrupt `.json` file, the system may auto-recover on next read.

4. **Check for stale locks.** The health check reports stale lock files (older than 30 seconds). Stale locks can indicate a crashed process.

## Resolution

### Corrupt `active-stack-state.json`

1. Check if a `.tmp` sidecar exists. If so, rename it to replace the corrupt file.
2. If no sidecar exists, delete the corrupt file. The system will create a fresh empty state on next write. Note: this clears all active stack bindings.

### Corrupt program/manifest files

1. Re-run `niche compile` for the affected program to regenerate compilation records and manifests.
2. If the source data is intact, the compilation flow will rebuild the domain pack and manifests from scratch.

### Missing store root

1. The store root is created automatically on first write. If it is missing, verify that the `OPENCLAW_STATE_DIR` environment variable is set correctly.
2. Check filesystem permissions -- the store root must be writable.

### Stale lock files

1. Delete the stale `.lock` file manually.
2. Investigate why the process that created the lock did not clean it up (crash, kill signal).

## Prevention

- Monitor the `niche.health` endpoint regularly.
- Use `niche export` to create backups of critical program data.
- Avoid killing the gateway process with `SIGKILL` during store writes; use graceful shutdown (`SIGTERM`).
