import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nicheHealthCheck } from "../../src/niche/health.js";
import { resolveNicheStoreRoots } from "../../src/niche/store/paths.js";
import { withTempHome } from "../helpers/temp-home.js";

describe("nicheHealthCheck", () => {
  it("returns unhealthy when store root does not exist", async () => {
    await withTempHome(async () => {
      const result = nicheHealthCheck(process.env);
      expect(result.status).toBe("unhealthy");
      expect(result.checks.some((c) => c.name === "store_root_exists" && !c.passed)).toBe(true);
      expect(result.timestamp).toBeTruthy();
    });
  });

  it("returns healthy when store root exists and is writable", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.root, { recursive: true });
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.mkdirSync(roots.releases, { recursive: true });

      const result = nicheHealthCheck(process.env);
      expect(result.status).toBe("healthy");
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });
  });

  it("returns degraded when active-stack-state.json is corrupt", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.root, { recursive: true });
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.mkdirSync(roots.releases, { recursive: true });

      const activeStatePath = path.join(roots.releases, "active-stack-state.json");
      fs.writeFileSync(activeStatePath, "not-json{{{", "utf-8");

      const result = nicheHealthCheck(process.env);
      expect(result.status).toBe("degraded");
      expect(result.checks.some((c) => c.name === "active_stack_state_valid" && !c.passed)).toBe(
        true,
      );
    });
  });

  it("detects stale lock files", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.root, { recursive: true });
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.mkdirSync(roots.releases, { recursive: true });

      const lockPath = path.join(roots.releases, "active-stack-state.json.lock");
      fs.writeFileSync(lockPath, "locked", "utf-8");
      // Artificially age the lock file by 60 seconds
      const oldTime = new Date(Date.now() - 60_000);
      fs.utimesSync(lockPath, oldTime, oldTime);

      const result = nicheHealthCheck(process.env);
      expect(result.checks.some((c) => c.name === "no_stale_locks" && !c.passed)).toBe(true);
    });
  });

  it("includes a timestamp in the result", async () => {
    await withTempHome(async () => {
      const result = nicheHealthCheck(process.env);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
