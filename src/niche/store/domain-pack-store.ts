import fs from "node:fs";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import { NicheCompilationRecordSchema, type NicheCompilationRecord } from "../schema/index.js";
import { resolveNicheCompilationRecordStorePath, resolveNicheStoreRoots } from "./paths.js";

const NICHE_COMPILATION_RECORD_CACHE_KEY = "niche-store-compilation-record";

function assertCompilationRecord(record: NicheCompilationRecord): NicheCompilationRecord {
  const validation = validateJsonSchemaValue({
    schema: NicheCompilationRecordSchema,
    cacheKey: NICHE_COMPILATION_RECORD_CACHE_KEY,
    value: record,
  });
  if (validation.ok) {
    return record;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid niche compilation record: ${details}`);
}

export function writeNicheCompilationRecord(
  record: NicheCompilationRecord,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertCompilationRecord(record);
  const pathname = resolveNicheCompilationRecordStorePath(validated.compilation_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing niche compilation record: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function ensureStoredNicheCompilationRecord(
  record: NicheCompilationRecord,
  env: NodeJS.ProcessEnv = process.env,
): { path: string; record: NicheCompilationRecord } {
  const validated = assertCompilationRecord(record);
  const existing = getNicheCompilationRecord(validated.compilation_id, env);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(validated)) {
      throw new Error(
        `Niche compilation record ${validated.compilation_id} is already stored with different content.`,
      );
    }
    return {
      path: resolveNicheCompilationRecordStorePath(validated.compilation_id, env),
      record: existing,
    };
  }
  return {
    path: writeNicheCompilationRecord(validated, env),
    record: validated,
  };
}

export function getNicheCompilationRecord(
  compilationId: string,
  env: NodeJS.ProcessEnv = process.env,
): NicheCompilationRecord | null {
  const raw = readJsonFileStrict(
    resolveNicheCompilationRecordStorePath(compilationId, env),
    `niche compilation record ${compilationId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertCompilationRecord(raw as NicheCompilationRecord);
}

export function listNicheCompilationRecords(
  params: {
    nicheProgramId?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): NicheCompilationRecord[] {
  const root = resolveNicheStoreRoots(params.env).domainPacks;
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .toSorted((left, right) => left.localeCompare(right))
    .map((compilationId) => getNicheCompilationRecord(compilationId, params.env))
    .filter((record): record is NicheCompilationRecord => record !== null)
    .filter((record) =>
      params.nicheProgramId ? record.niche_program_id === params.nicheProgramId : true,
    );
}

export function getLatestNicheCompilationRecordForProgram(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): NicheCompilationRecord | null {
  const matching = listNicheCompilationRecords({
    nicheProgramId,
    env,
  }).toSorted((left, right) => right.compiled_at.localeCompare(left.compiled_at));
  return matching[0] ?? null;
}
