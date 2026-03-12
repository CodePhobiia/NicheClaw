import { createHash } from "node:crypto";

function normalizeString(value: string): string {
  return value.replaceAll("\\", "/").replace(/^[A-Za-z]:/u, "");
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeForHash(entry)]),
    );
  }
  if (typeof value === "string") {
    return normalizeString(value);
  }
  return value;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeStableContentHash(value: unknown): string {
  const hash = createHash("sha256");
  hash.update(stableSerialize(normalizeForHash(value)));
  return hash.digest("hex");
}

export function computeBenchmarkSuiteHash(value: unknown): string {
  return computeStableContentHash(value);
}

export function computeBenchmarkFixturePackHash(value: unknown): string {
  return computeStableContentHash(value);
}

export function computeEnvironmentSnapshotHash(value: unknown): string {
  return computeStableContentHash(value);
}
