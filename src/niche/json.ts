import fs from "node:fs";
import { tryRecoverCorruptedJsonFile } from "../infra/json-file.js";

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readJsonFileStrict(pathname: string, label: string = pathname): unknown {
  if (!fs.existsSync(pathname)) {
    return undefined;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(pathname, "utf8");
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${formatErrorMessage(error)}`, { cause: error });
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (parseError) {
    // Attempt recovery from the atomic-write .tmp sidecar before throwing.
    const recovered = tryRecoverCorruptedJsonFile(pathname);
    if (recovered !== undefined) {
      return recovered;
    }
    throw new Error(`Invalid JSON in ${label}: ${formatErrorMessage(parseError)}`, {
      cause: parseError,
    });
  }
}

export function readRequiredJsonFileStrict(pathname: string, label: string = pathname): unknown {
  const raw = readJsonFileStrict(pathname, label);
  if (raw === undefined) {
    throw new Error(`Required JSON file not found: ${label}`);
  }
  return raw;
}
