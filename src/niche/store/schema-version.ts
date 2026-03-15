import fs from "node:fs";
import path from "node:path";
import { NICHE_SCHEMA_VERSION } from "../schema/common.js";
import { resolveNicheStateRoot } from "./paths.js";

const VERSION_FILE = ".schema-version";

export function writeSchemaVersion(env: NodeJS.ProcessEnv = process.env): void {
  const root = resolveNicheStateRoot(env);
  if (!fs.existsSync(root)) return;
  const versionPath = path.join(root, VERSION_FILE);
  fs.writeFileSync(
    versionPath,
    JSON.stringify({ version: NICHE_SCHEMA_VERSION, written_at: new Date().toISOString() }),
  );
}

export function validateSchemaVersion(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  stored?: string;
  current: string;
  message?: string;
} {
  const root = resolveNicheStateRoot(env);
  const versionPath = path.join(root, VERSION_FILE);
  if (!fs.existsSync(versionPath)) {
    return { ok: true, current: NICHE_SCHEMA_VERSION, message: "No stored version (new store)." };
  }
  try {
    const stored = JSON.parse(fs.readFileSync(versionPath, "utf-8")).version as string;
    if (stored === NICHE_SCHEMA_VERSION) {
      return { ok: true, stored, current: NICHE_SCHEMA_VERSION };
    }
    const [storedMajor] = stored.split(".");
    const [currentMajor] = NICHE_SCHEMA_VERSION.split(".");
    if (storedMajor !== currentMajor) {
      return {
        ok: false,
        stored,
        current: NICHE_SCHEMA_VERSION,
        message: `Major version mismatch: stored ${stored}, current ${NICHE_SCHEMA_VERSION}.`,
      };
    }
    return {
      ok: true,
      stored,
      current: NICHE_SCHEMA_VERSION,
      message: `Minor version difference: stored ${stored}, current ${NICHE_SCHEMA_VERSION}.`,
    };
  } catch {
    return {
      ok: true,
      current: NICHE_SCHEMA_VERSION,
      message: "Could not read stored version.",
    };
  }
}
