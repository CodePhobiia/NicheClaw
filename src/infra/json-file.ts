import fs from "node:fs";
import path from "node:path";

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

const RETRYABLE_CODES = new Set(["EBUSY", "EACCES", "EPERM", "EAGAIN", "ENOTEMPTY"]);

/**
 * Retry a synchronous file operation on transient I/O errors (EBUSY, EACCES, etc.)
 * using exponential backoff with Atomics.wait (sync context, no CPU burn).
 */
export function retryFileOp<T>(fn: () => T, maxRetries = 3, baseDelayMs = 50): T {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (!code || !RETRYABLE_CODES.has(code) || attempt === maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      Atomics.wait(sleepBuffer, 0, 0, delay);
    }
  }
  throw new Error("retryFileOp: unreachable");
}

/**
 * Attempt to recover a corrupted JSON file by falling back to the `.tmp`
 * sidecar written during atomic saves, or moving the corrupt file aside.
 */
export function tryRecoverCorruptedJsonFile(pathname: string): unknown | undefined {
  const tmpPath = pathname + ".tmp";
  if (fs.existsSync(tmpPath)) {
    try {
      const tmpContent = fs.readFileSync(tmpPath, "utf-8");
      const parsed = JSON.parse(tmpContent);
      fs.renameSync(tmpPath, pathname);
      return parsed;
    } catch {
      /* tmp also corrupt — fall through */
    }
  }
  // Move corrupt file to a timestamped backup so subsequent reads don't loop.
  const backupPath = `${pathname}.corrupt.${Date.now()}`;
  try {
    fs.renameSync(pathname, backupPath);
  } catch {
    /* ignore rename failure */
  }
  return undefined;
}

export function loadJsonFile(pathname: string): unknown {
  try {
    if (!fs.existsSync(pathname)) {
      return undefined;
    }
    const raw = retryFileOp(() => fs.readFileSync(pathname, "utf8"));
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function saveJsonFile(pathname: string, data: unknown) {
  const dir = path.dirname(pathname);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  // Atomic write: write to temp file, chmod, then rename into place.
  // rename() is atomic on both POSIX and Windows (same volume).
  const tmpPath = `${pathname}.tmp`;
  retryFileOp(() => fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8"));
  fs.chmodSync(tmpPath, 0o600);
  retryFileOp(() => fs.renameSync(tmpPath, pathname));
}
