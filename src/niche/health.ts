import fs from "node:fs";
import { resolveNicheStoreRoots } from "./store/paths.js";
import { listNichePrograms } from "./store/program-store.js";

export type NicheHealthCheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Array<{ name: string; passed: boolean; message?: string }>;
  timestamp: string;
};

export function nicheHealthCheck(env: NodeJS.ProcessEnv = process.env): NicheHealthCheckResult {
  const checks: NicheHealthCheckResult["checks"] = [];

  // Check store root exists
  const roots = resolveNicheStoreRoots(env);
  const rootExists = fs.existsSync(roots.root);
  checks.push({
    name: "store_root_exists",
    passed: rootExists,
    message: rootExists ? undefined : `Store root not found: ${roots.root}`,
  });

  if (!rootExists) {
    return { status: "unhealthy", checks, timestamp: new Date().toISOString() };
  }

  // Check store root is writable
  let writable = false;
  try {
    const testPath = `${roots.root}/.health-check-${Date.now()}`;
    fs.writeFileSync(testPath, "ok");
    fs.unlinkSync(testPath);
    writable = true;
  } catch {
    /* not writable */
  }
  checks.push({
    name: "store_root_writable",
    passed: writable,
    message: writable ? undefined : "Store root is not writable",
  });

  // Check active-stack state
  const activeStatePath = `${roots.releases}/active-stack-state.json`;
  if (fs.existsSync(activeStatePath)) {
    try {
      JSON.parse(fs.readFileSync(activeStatePath, "utf-8"));
      checks.push({ name: "active_stack_state_valid", passed: true });
    } catch {
      checks.push({
        name: "active_stack_state_valid",
        passed: false,
        message: "active-stack-state.json is corrupt",
      });
    }
  } else {
    checks.push({
      name: "active_stack_state_valid",
      passed: true,
      message: "No active stack state (normal for new installs)",
    });
  }

  // Check programs
  try {
    const programs = listNichePrograms(env);
    checks.push({
      name: "programs_readable",
      passed: true,
      message: `${programs.length} program(s) found`,
    });
  } catch (err) {
    checks.push({ name: "programs_readable", passed: false, message: String(err) });
  }

  // Check for stale lock files
  const lockPath = `${activeStatePath}.lock`;
  if (fs.existsSync(lockPath)) {
    const stat = fs.statSync(lockPath);
    const age = Date.now() - stat.mtimeMs;
    if (age > 30_000) {
      checks.push({
        name: "no_stale_locks",
        passed: false,
        message: `Stale lock file: ${lockPath} (age: ${Math.round(age / 1000)}s)`,
      });
    } else {
      checks.push({ name: "no_stale_locks", passed: true });
    }
  } else {
    checks.push({ name: "no_stale_locks", passed: true });
  }

  const allPassed = checks.every((c) => c.passed);
  const status = allPassed
    ? "healthy"
    : checks.some((c) => !c.passed && c.name.includes("writable"))
      ? "unhealthy"
      : "degraded";

  return { status, checks, timestamp: new Date().toISOString() };
}
