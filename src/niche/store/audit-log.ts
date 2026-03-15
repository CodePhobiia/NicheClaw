import fs from "node:fs";
import path from "node:path";
import { resolveNicheStoreRoots } from "./paths.js";

export type AuditLogEntry = {
  event_id: string;
  event_type: string;
  occurred_at: string;
  actor: string;
  niche_program_id?: string;
  run_id?: string;
  payload_summary: string;
};

export function resolveAuditLogPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveNicheStoreRoots(env).audit, "audit.jsonl");
}

export function appendAuditEntry(entry: AuditLogEntry, env: NodeJS.ProcessEnv = process.env): void {
  const logPath = resolveAuditLogPath(env);
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

export function readAuditEntries(params?: {
  eventType?: string;
  nicheProgramId?: string;
  since?: string;
  limit?: number;
  env?: NodeJS.ProcessEnv;
}): AuditLogEntry[] {
  const logPath = resolveAuditLogPath(params?.env ?? process.env);
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
  let entries = lines.map((line) => JSON.parse(line) as AuditLogEntry);
  if (params?.eventType) entries = entries.filter((e) => e.event_type === params.eventType);
  if (params?.nicheProgramId)
    entries = entries.filter((e) => e.niche_program_id === params.nicheProgramId);
  if (params?.since) entries = entries.filter((e) => e.occurred_at >= params.since!);
  if (params?.limit) entries = entries.slice(-params.limit);
  return entries;
}
