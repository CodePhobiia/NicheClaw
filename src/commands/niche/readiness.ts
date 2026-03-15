import { generateReadinessGuidance, formatReadinessGuidance } from "../../niche/domain/index.js";
import type { ReadinessReport } from "../../niche/schema/index.js";
import { getReadinessReportForProgram } from "../../niche/store/index.js";
import type { RuntimeEnv } from "../../runtime.js";
import { defaultRuntime } from "../../runtime.js";

export type NicheReadinessOptions = {
  nicheProgramId: string;
  json?: boolean;
};

export type NicheReadinessCommandResult = {
  readiness_report: ReadinessReport;
};

function formatSummary(result: NicheReadinessCommandResult): string {
  const report = result.readiness_report;
  const lines = [
    `Readiness for ${report.niche_program_id}: ${report.status}`,
    `Report: ${report.readiness_report_id}`,
  ];
  if (report.hard_blockers.length > 0 || report.warnings.length > 0) {
    const guidance = generateReadinessGuidance(report);
    lines.push("", formatReadinessGuidance(guidance));
    if (report.status === "not_ready") {
      lines.push(
        "",
        "Fix the blockers above, then recompile: openclaw niche compile --niche-program-id " +
          report.niche_program_id +
          " --source <paths...>",
      );
    }
  }
  return lines.join("\n");
}

export async function nicheReadinessCommand(
  opts: NicheReadinessOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<NicheReadinessCommandResult> {
  const readinessReport = getReadinessReportForProgram(opts.nicheProgramId, process.env);
  if (!readinessReport) {
    throw new Error(
      `Missing readiness report for niche program "${opts.nicheProgramId}".\nRun: openclaw niche compile --niche-program-id ${opts.nicheProgramId} --source <paths...>`,
    );
  }
  const result: NicheReadinessCommandResult = {
    readiness_report: readinessReport,
  };
  runtime.log(opts.json ? JSON.stringify(result, null, 2) : formatSummary(result));
  return result;
}
