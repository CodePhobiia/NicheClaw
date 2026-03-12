import fs from "node:fs";
import path from "node:path";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { RunTraceSchema, type ReplayabilityStatus, type RunTrace, type RunTraceMode } from "../schema/index.js";
import { readJsonFileStrict } from "../json.js";
import { resolveNicheStoreRoots } from "./paths.js";

const TRACE_STORE_CACHE_KEY = "niche-store-run-trace";

export type RunTraceQuery = {
  traceId?: string;
  runId?: string;
  nicheProgramId?: string;
  mode?: RunTraceMode;
  manifestId?: string;
  replayabilityStatus?: ReplayabilityStatus;
  benchmarkArmId?: string;
  benchmarkCaseId?: string;
};

function assertRunTrace(trace: RunTrace): RunTrace {
  const result = validateJsonSchemaValue({
    schema: RunTraceSchema,
    cacheKey: TRACE_STORE_CACHE_KEY,
    value: trace,
  });
  if (result.ok) {
    return trace;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid run trace: ${details}`);
}

function resolveTraceRoot(env: NodeJS.ProcessEnv = process.env): string {
  return resolveNicheStoreRoots(env).traces;
}

function resolveTracePath(traceId: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveTraceRoot(env), `${traceId}.json`);
}

export function appendRunTrace(
  trace: RunTrace,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertRunTrace(trace);
  const pathname = resolveTracePath(validated.trace_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing run trace: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function getRunTrace(
  traceId: string,
  env: NodeJS.ProcessEnv = process.env,
): RunTrace | null {
  const pathname = resolveTracePath(traceId, env);
  const raw = readJsonFileStrict(pathname, `run trace ${traceId}`);
  if (raw === undefined) {
    return null;
  }
  return assertRunTrace(raw as RunTrace);
}

export function listRunTraces(env: NodeJS.ProcessEnv = process.env): RunTrace[] {
  const root = resolveTraceRoot(env);
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))
    .map((filename) => {
      const traceId = filename.replace(/\.json$/u, "");
      const trace = getRunTrace(traceId, env);
      if (!trace) {
        throw new Error(`Run trace disappeared while listing: ${traceId}`);
      }
      return trace;
    });
}

export function queryRunTraces(
  query: RunTraceQuery,
  env: NodeJS.ProcessEnv = process.env,
): RunTrace[] {
  return listRunTraces(env).filter((trace) => {
    if (query.traceId && trace.trace_id !== query.traceId) {
      return false;
    }
    if (query.runId && trace.run_id !== query.runId) {
      return false;
    }
    if (query.nicheProgramId && trace.niche_program_id !== query.nicheProgramId) {
      return false;
    }
    if (query.mode && trace.mode !== query.mode) {
      return false;
    }
    if (
      query.manifestId &&
      trace.baseline_or_candidate_manifest_id !== query.manifestId
    ) {
      return false;
    }
    if (
      query.replayabilityStatus &&
      trace.replayability_status !== query.replayabilityStatus
    ) {
      return false;
    }
    if (
      query.benchmarkArmId &&
      trace.benchmark_arm_ref?.benchmark_arm_id !== query.benchmarkArmId
    ) {
      return false;
    }
    if (
      query.benchmarkCaseId &&
      trace.benchmark_case_ref?.case_id !== query.benchmarkCaseId
    ) {
      return false;
    }
    return true;
  });
}
