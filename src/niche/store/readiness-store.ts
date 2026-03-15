import fs from "node:fs";
import { saveJsonFile } from "../../infra/json-file.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readJsonFileStrict } from "../json.js";
import { type ReadinessReport, ReadinessReportSchema } from "../schema/index.js";
import { resolveNicheStoreRoots, resolveReadinessReportStorePath } from "./paths.js";

const READINESS_REPORT_CACHE_KEY = "niche-store-readiness-report";

function assertReadinessReport(report: ReadinessReport): ReadinessReport {
  const result = validateJsonSchemaValue({
    schema: ReadinessReportSchema,
    cacheKey: READINESS_REPORT_CACHE_KEY,
    value: report,
  });
  if (result.ok) {
    return report;
  }
  const details = result.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid readiness report: ${details}`);
}

function readStoredReadinessReport(
  readinessReportId: string,
  env: NodeJS.ProcessEnv = process.env,
): ReadinessReport | null {
  const raw = readJsonFileStrict(
    resolveReadinessReportStorePath(readinessReportId, env),
    `readiness report ${readinessReportId}`,
  );
  if (raw === undefined) {
    return null;
  }
  return assertReadinessReport(raw as ReadinessReport);
}

export function writeReadinessReport(
  report: ReadinessReport,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertReadinessReport(report);
  const pathname = resolveReadinessReportStorePath(validated.readiness_report_id, env);
  if (fs.existsSync(pathname)) {
    throw new Error(`Refusing to overwrite existing readiness report: ${pathname}`);
  }
  saveJsonFile(pathname, validated);
  return pathname;
}

export function saveReadinessReport(
  report: ReadinessReport,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const validated = assertReadinessReport(report);
  const pathname = resolveReadinessReportStorePath(validated.readiness_report_id, env);
  saveJsonFile(pathname, validated);
  return pathname;
}

export function ensureStoredReadinessReport(
  report: ReadinessReport,
  env: NodeJS.ProcessEnv = process.env,
): { path: string; report: ReadinessReport } {
  const validated = assertReadinessReport(report);
  const existing = readStoredReadinessReport(validated.readiness_report_id, env);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(validated)) {
      throw new Error(
        `Readiness report ${validated.readiness_report_id} is already stored with different content.`,
      );
    }
    return {
      path: resolveReadinessReportStorePath(validated.readiness_report_id, env),
      report: existing,
    };
  }
  return {
    path: writeReadinessReport(validated, env),
    report: validated,
  };
}

export function getReadinessReport(
  readinessReportId: string,
  env: NodeJS.ProcessEnv = process.env,
): ReadinessReport | null {
  return readStoredReadinessReport(readinessReportId, env);
}

export function getReadinessReportForProgram(
  nicheProgramId: string,
  env: NodeJS.ProcessEnv = process.env,
): ReadinessReport | null {
  return getReadinessReport(`${nicheProgramId}-readiness`, env);
}

export function listReadinessReports(env: NodeJS.ProcessEnv = process.env): ReadinessReport[] {
  const root = resolveNicheStoreRoots(env).readinessReports;
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/u, ""))
    .toSorted((left, right) => left.localeCompare(right))
    .map((reportId) => {
      const report = getReadinessReport(reportId, env);
      if (!report) {
        throw new Error(`Readiness report disappeared while listing: ${reportId}`);
      }
      return report;
    });
}
