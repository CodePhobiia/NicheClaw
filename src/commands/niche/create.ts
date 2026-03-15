import { readRequiredJsonFileStrict } from "../../niche/json.js";
import { NicheProgramSchema, type NicheProgram } from "../../niche/schema/index.js";
import { ensureStoredNicheProgram } from "../../niche/store/index.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheCreateOptions = {
  programPath: string;
  json?: boolean;
};

export type NicheCreateCommandResult = {
  niche_program_id: string;
  path: string;
  program: NicheProgram;
};

function assertNicheProgram(value: unknown, label: string): NicheProgram {
  const validation = validateJsonSchemaValue({
    schema: NicheProgramSchema,
    cacheKey: "niche-create-command-program",
    value,
  });
  if (validation.ok) {
    return value as NicheProgram;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function formatSummary(result: NicheCreateCommandResult): string {
  return [`Stored niche program ${result.niche_program_id}.`, `Path: ${result.path}`].join("\n");
}

export async function nicheCreateCommand(
  opts: NicheCreateOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheCreateCommandResult> {
  const program = assertNicheProgram(
    readRequiredJsonFileStrict(opts.programPath, `niche program ${opts.programPath}`),
    `niche program ${opts.programPath}`,
  );
  const stored = ensureStoredNicheProgram(program, process.env);
  const result: NicheCreateCommandResult = {
    niche_program_id: stored.program.niche_program_id,
    path: stored.path,
    program: stored.program,
  };
  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return result;
}
