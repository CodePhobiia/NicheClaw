import fs from "node:fs";

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function readJsonFileStrict(
  pathname: string,
  label: string = pathname,
): unknown {
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
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${formatErrorMessage(error)}`, { cause: error });
  }
}

export function readRequiredJsonFileStrict(
  pathname: string,
  label: string = pathname,
): unknown {
  const raw = readJsonFileStrict(pathname, label);
  if (raw === undefined) {
    throw new Error(`Required JSON file not found: ${label}`);
  }
  return raw;
}
