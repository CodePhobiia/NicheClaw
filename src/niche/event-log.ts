import fs from "node:fs";
import path from "node:path";
import { resolveNicheStoreRoots } from "./store/paths.js";

export function resolveNicheEventLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveNicheStoreRoots(env).root, "event-log.jsonl");
}

export function appendNicheEventLog(event: unknown, env: NodeJS.ProcessEnv = process.env): void {
  const logPath = resolveNicheEventLogPath(env);
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(logPath, JSON.stringify(event) + "\n", "utf8");
}

export function readNicheEventLog(params?: {
  since?: string;
  limit?: number;
  env?: NodeJS.ProcessEnv;
}): unknown[] {
  const logPath = resolveNicheEventLogPath(params?.env ?? process.env);
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  let entries = lines.map((line) => JSON.parse(line));
  if (params?.since) {
    entries = entries.filter(
      (e: Record<string, unknown>) => (e.occurred_at as string) >= params.since!,
    );
  }
  if (params?.limit) entries = entries.slice(-params.limit);
  return entries;
}
