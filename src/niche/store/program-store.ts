import fs from "node:fs";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import { NicheProgramSchema, type NicheProgram } from "../schema/index.js";
import { resolveNicheProgramStorePath, resolveNicheStoreRoots } from "./paths.js";

const NICHE_PROGRAM_CACHE_KEY = "niche-store-program";

function assertNicheProgram(program: NicheProgram): NicheProgram {
  const validation = validateJsonSchemaValue({
    schema: NicheProgramSchema,
    cacheKey: NICHE_PROGRAM_CACHE_KEY,
    value: program,
  });
  if (validation.ok) {
    return program;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid niche program: ${details}`);
}

export function writeNicheProgram(
  program: NicheProgram,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertNicheProgram(program);
  const pathname = resolveNicheProgramStorePath(validated.niche_program_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing niche program: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function ensureStoredNicheProgram(
  program: NicheProgram,
  env: NodeJS.ProcessEnv = process.env,
): { path: string; program: NicheProgram } {
  const validated = assertNicheProgram(program);
  const existing = getNicheProgram(validated.niche_program_id, env);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(validated)) {
      throw new Error(
        `Niche program ${validated.niche_program_id} is already stored with different content.`,
      );
    }
    return {
      path: resolveNicheProgramStorePath(validated.niche_program_id, env),
      program: existing,
    };
  }
  return {
    path: writeNicheProgram(validated, env),
    program: validated,
  };
}

export function getNicheProgram(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): NicheProgram | null {
  const raw = readJsonFileStrict(
    resolveNicheProgramStorePath(nicheProgramId, env),
    `niche program ${nicheProgramId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertNicheProgram(raw as NicheProgram);
}

export function listNichePrograms(env: NodeJS.ProcessEnv = process.env): NicheProgram[] {
  const root = resolveNicheStoreRoots(env).programs;
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .toSorted((left, right) => left.localeCompare(right))
    .map((programId) => {
      const program = getNicheProgram(programId, env);
      if (!program) {
        throw new Error(`Niche program disappeared while listing: ${programId}`);
      }
      return program;
    });
}
