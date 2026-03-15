import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { readRequiredJsonFileStrict } from "../json.js";
import type { PreparedNicheRunSeed, ReadinessReport } from "../schema/index.js";
import { isReadyForSpecialization, ReadinessReportSchema } from "../schema/index.js";
import {
  ensureStoredReadinessReport,
  getReadinessReport,
  getReadinessReportForProgram,
} from "../store/index.js";
import { buildReadinessRefusal } from "./readiness-gate.js";

function assertReadinessReport(value: unknown, label: string): ReadinessReport {
  const validation = validateJsonSchemaValue({
    schema: ReadinessReportSchema,
    cacheKey: "niche-readiness-enforcement-report",
    value,
  });
  if (validation.ok) {
    return value as ReadinessReport;
  }
  const details = validation.errors.map((error) => error.text).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function validateProgramBinding(report: ReadinessReport, nicheProgramId: string): void {
  if (report.niche_program_id !== nicheProgramId) {
    throw new Error(
      `Readiness report ${report.readiness_report_id} targets ${report.niche_program_id}, expected ${nicheProgramId}.`,
    );
  }
}

export function resolveSpecializationReadiness(params: {
  nicheProgramId: string;
  readinessReportPath?: string;
  env?: NodeJS.ProcessEnv;
}): ReadinessReport {
  const report = params.readinessReportPath
    ? ensureStoredReadinessReport(
        assertReadinessReport(
          readRequiredJsonFileStrict(
            params.readinessReportPath,
            `readiness report ${params.readinessReportPath}`,
          ),
          `readiness report ${params.readinessReportPath}`,
        ),
        params.env,
      ).report
    : getReadinessReportForProgram(params.nicheProgramId, params.env);
  if (!report) {
    throw new Error(
      `No stored readiness report exists for niche program ${params.nicheProgramId}. Pass --readiness-report first.`,
    );
  }
  validateProgramBinding(report, params.nicheProgramId);
  if (!isReadyForSpecialization(report)) {
    throw new Error(buildReadinessRefusal(report).reason);
  }
  return report;
}

export function assertPreparedSeedReadiness(
  seed: PreparedNicheRunSeed,
  env: NodeJS.ProcessEnv = process.env,
): ReadinessReport {
  const reportId = seed.readiness_report_id?.trim();
  if (!reportId) {
    throw new Error(
      `Prepared Niche run seed ${seed.seed_id} is missing readiness_report_id and cannot be activated.`,
    );
  }
  const report = getReadinessReport(reportId, env);
  if (!report) {
    throw new Error(
      `Prepared Niche run seed ${seed.seed_id} references missing readiness report ${reportId}.`,
    );
  }
  validateProgramBinding(report, seed.niche_program_id);
  if (!isReadyForSpecialization(report)) {
    throw new Error(buildReadinessRefusal(report).reason);
  }
  return report;
}
