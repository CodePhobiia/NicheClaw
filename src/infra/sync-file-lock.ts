import fs from "node:fs";

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

/** Block the thread for `ms` without burning CPU (uses Atomics.wait). */
function syncSleep(ms: number): void {
  Atomics.wait(sleepBuffer, 0, 0, ms);
}

export type SyncFileLockOptions = {
  maxRetries?: number;
  retryDelayMs?: number;
  staleLockMaxAgeMs?: number;
};

/**
 * Synchronous exclusive file lock with stale-lock detection.
 *
 * Acquires an exclusive lock by creating `lockPath` with `wx` mode, executes
 * `fn`, then removes the lock file. If the lock is held by a dead process or
 * is older than `staleLockMaxAgeMs`, it is treated as stale and reclaimed.
 */
export function withSyncFileLock<T>(lockPath: string, fn: () => T, opts?: SyncFileLockOptions): T {
  const maxRetries = opts?.maxRetries ?? 10;
  const retryDelayMs = opts?.retryDelayMs ?? 50;
  const staleLockMaxAgeMs = opts?.staleLockMaxAgeMs ?? 30_000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.writeFileSync(lockPath, `${process.pid}\n`, { flag: "wx" });
      try {
        return fn();
      } finally {
        try {
          fs.unlinkSync(lockPath);
        } catch {
          /* ignore unlock failure */
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Stale-lock detection: check PID liveness and lock age.
      try {
        const content = fs.readFileSync(lockPath, "utf-8").trim();
        const pid = parseInt(content, 10);
        const stat = fs.statSync(lockPath);
        const age = Date.now() - stat.mtimeMs;
        let stale = age > staleLockMaxAgeMs;
        if (!stale && !isNaN(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch {
            stale = true;
          }
        }
        if (stale) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* ignore */
          }
          continue;
        }
      } catch {
        /* ignore stat/read errors — fall through to retry delay */
      }

      if (attempt < maxRetries - 1) {
        syncSleep(retryDelayMs);
      }
    }
  }
  throw new Error(`Failed to acquire lock: ${lockPath} (after ${maxRetries} retries)`);
}
