import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withSyncFileLock } from "../../../src/infra/sync-file-lock.js";
import { withTempHome } from "../../helpers/temp-home.js";

describe("withSyncFileLock", () => {
  it("executes the function and cleans up the lock file", async () => {
    await withTempHome(async (home) => {
      const lockPath = path.join(home, "test.lock");
      const result = withSyncFileLock(lockPath, () => {
        // Lock file should exist while the function is running
        expect(fs.existsSync(lockPath)).toBe(true);
        return "done";
      });
      expect(result).toBe("done");
      // Lock file should be cleaned up after
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  it("cleans up lock file even when fn throws", async () => {
    await withTempHome(async (home) => {
      const lockPath = path.join(home, "test-throw.lock");
      expect(() =>
        withSyncFileLock(lockPath, () => {
          throw new Error("oops");
        }),
      ).toThrow("oops");
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  it("writes the current PID into the lock file", async () => {
    await withTempHome(async (home) => {
      const lockPath = path.join(home, "test-pid.lock");
      withSyncFileLock(lockPath, () => {
        const content = fs.readFileSync(lockPath, "utf-8").trim();
        expect(content).toBe(String(process.pid));
      });
    });
  });

  it("detects stale lock from a dead PID and reclaims it", async () => {
    await withTempHome(async (home) => {
      const lockPath = path.join(home, "test-stale-pid.lock");
      // Write a lock file with a PID that does not exist (very high number)
      fs.writeFileSync(lockPath, "999999999\n", { flag: "wx" });

      const result = withSyncFileLock(lockPath, () => "reclaimed", {
        maxRetries: 3,
        retryDelayMs: 1,
        staleLockMaxAgeMs: 60_000,
      });
      expect(result).toBe("reclaimed");
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  it("detects stale lock from old mtime and reclaims it", async () => {
    await withTempHome(async (home) => {
      const lockPath = path.join(home, "test-stale-age.lock");
      // Write a lock file with our own PID but old mtime
      fs.writeFileSync(lockPath, `${process.pid}\n`, { flag: "wx" });
      // Set mtime to 60 seconds ago
      const pastTime = new Date(Date.now() - 60_000);
      fs.utimesSync(lockPath, pastTime, pastTime);

      const result = withSyncFileLock(lockPath, () => "reclaimed-by-age", {
        maxRetries: 3,
        retryDelayMs: 1,
        staleLockMaxAgeMs: 30_000,
      });
      expect(result).toBe("reclaimed-by-age");
    });
  });

  it("throws after exhausting retries when lock is held by a live process", async () => {
    await withTempHome(async (home) => {
      const lockPath = path.join(home, "test-held.lock");
      // Write lock with our own PID (alive) and recent mtime
      fs.writeFileSync(lockPath, `${process.pid}\n`, { flag: "wx" });

      expect(() =>
        withSyncFileLock(lockPath, () => "should not run", {
          maxRetries: 2,
          retryDelayMs: 1,
          staleLockMaxAgeMs: 60_000,
        }),
      ).toThrow(/Failed to acquire lock/);

      // Clean up
      fs.unlinkSync(lockPath);
    });
  });

  it("propagates non-EEXIST errors immediately", async () => {
    await withTempHome(async (home) => {
      // Use a path inside a non-existent directory to trigger ENOENT
      const lockPath = path.join(home, "nonexistent-dir", "test.lock");
      expect(() => withSyncFileLock(lockPath, () => "should not run")).toThrow();
    });
  });
});
