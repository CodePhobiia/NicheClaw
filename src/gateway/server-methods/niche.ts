import { nicheExportCommand } from "../../commands/niche/export.js";
import { nicheGcCommand } from "../../commands/niche/gc.js";
import { nicheImportCommand } from "../../commands/niche/import.js";
import { nicheListCommand } from "../../commands/niche/list.js";
import { nicheNextCommand } from "../../commands/niche/next.js";
import { nicheStatusCommand } from "../../commands/niche/status.js";
import { nicheVerify } from "../../commands/niche/verify.js";
import { sanitizeNicheTextField } from "../../niche/domain/sanitize-input.js";
import { readNicheEventLog } from "../../niche/event-log.js";
import { nicheHealthCheck } from "../../niche/health.js";
import { getNicheMetrics, getNicheMetricsStartTime } from "../../niche/metrics.js";
import {
  actuateReleaseDecision,
  executeRollback,
  PromotedMonitorDefinitionSchema,
  PromotedMonitorObservationSchema,
  runMonitorAssessmentCycle,
  type PromotedMonitorDefinition,
  type PromotedMonitorObservation,
} from "../../niche/release/index.js";
import {
  getActiveNicheRuntimeState,
  getActiveNicheStackRecord,
  getBenchmarkResultRecord,
  getLatestNicheCompilationRecordForProgram,
  getNicheCompilationRecord,
  getNicheProgram,
  getReadinessReportForProgram,
  listBenchmarkResultRecords,
  listNicheCompilationRecords,
  listNichePrograms,
  listReadinessReports,
  getBaselineManifest,
  getCandidateManifest,
  listBaselineManifests,
  listCandidateManifests,
  getRunTrace,
  listRunTraces,
} from "../../niche/store/index.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

export const nicheHandlers: GatewayRequestHandlers = {
  "niche.programs.list": ({ respond }) => {
    try {
      const programs = listNichePrograms(process.env);
      respond(true, { programs }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.programs.get": ({ params, respond }) => {
    try {
      const nicheProgramId = assertString(params.nicheProgramId, "nicheProgramId");
      const program = getNicheProgram(nicheProgramId, process.env);
      if (!program) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Program ${nicheProgramId} not found.`),
        );
        return;
      }
      respond(true, { program }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.compilations.list": ({ params, respond }) => {
    try {
      const nicheProgramId = params.nicheProgramId
        ? assertString(params.nicheProgramId, "nicheProgramId")
        : undefined;
      const records = listNicheCompilationRecords(
        nicheProgramId ? { nicheProgramId, env: process.env } : { env: process.env },
      );
      respond(true, { compilations: records }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.compilations.get": ({ params, respond }) => {
    try {
      const compilationId = assertString(params.compilationId, "compilationId");
      const record = getNicheCompilationRecord(compilationId, process.env);
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Compilation ${compilationId} not found.`),
        );
        return;
      }
      respond(true, { compilation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.compilations.latest": ({ params, respond }) => {
    try {
      const nicheProgramId = assertString(params.nicheProgramId, "nicheProgramId");
      const record = getLatestNicheCompilationRecordForProgram(nicheProgramId, process.env);
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `No compilations for program ${nicheProgramId}.`),
        );
        return;
      }
      respond(true, { compilation: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.readiness.get": ({ params, respond }) => {
    try {
      const nicheProgramId = assertString(params.nicheProgramId, "nicheProgramId");
      const report = getReadinessReportForProgram(nicheProgramId, process.env);
      if (!report) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `No readiness report for program ${nicheProgramId}.`,
          ),
        );
        return;
      }
      respond(true, { readiness: report }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.readiness.list": ({ respond }) => {
    try {
      const reports = listReadinessReports(process.env);
      respond(true, { reports }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.manifests.list": ({ params, respond }) => {
    try {
      const kind = params.kind as string | undefined;
      if (kind === "baseline" || !kind) {
        const baselines = listBaselineManifests(process.env);
        if (kind === "baseline") {
          respond(true, { manifests: baselines }, undefined);
          return;
        }
        const candidates = listCandidateManifests(process.env);
        respond(true, { baselines, candidates }, undefined);
        return;
      }
      if (kind === "candidate") {
        const candidates = listCandidateManifests(process.env);
        respond(true, { manifests: candidates }, undefined);
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Unknown manifest kind: ${kind}`),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.manifests.get": ({ params, respond }) => {
    try {
      const manifestId = assertString(params.manifestId, "manifestId");
      const kind = assertString(params.kind, "kind");
      if (kind === "baseline") {
        const manifest = getBaselineManifest(manifestId, process.env);
        respond(
          manifest ? true : false,
          manifest ? { manifest } : undefined,
          manifest
            ? undefined
            : errorShape(ErrorCodes.INVALID_REQUEST, `Baseline manifest ${manifestId} not found.`),
        );
        return;
      }
      if (kind === "candidate") {
        const manifest = getCandidateManifest(manifestId, process.env);
        respond(
          manifest ? true : false,
          manifest ? { manifest } : undefined,
          manifest
            ? undefined
            : errorShape(ErrorCodes.INVALID_REQUEST, `Candidate manifest ${manifestId} not found.`),
        );
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Unknown manifest kind: ${kind}`),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.benchmarks.list": ({ params, respond }) => {
    try {
      const filter: Parameters<typeof listBenchmarkResultRecords>[0] = {};
      if (params.benchmarkSuiteId) {
        filter.benchmarkSuiteId = assertString(params.benchmarkSuiteId, "benchmarkSuiteId");
      }
      if (params.baselineManifestId) {
        filter.baselineManifestId = assertString(params.baselineManifestId, "baselineManifestId");
      }
      if (params.candidateManifestId) {
        filter.candidateManifestId = assertString(
          params.candidateManifestId,
          "candidateManifestId",
        );
      }
      const records = listBenchmarkResultRecords({ ...filter, env: process.env });
      respond(true, { benchmarks: records }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.benchmarks.get": ({ params, respond }) => {
    try {
      const recordId = assertString(params.recordId, "recordId");
      const record = getBenchmarkResultRecord(recordId, process.env);
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Benchmark record ${recordId} not found.`),
        );
        return;
      }
      respond(true, { benchmark: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.runtime.state": ({ respond }) => {
    try {
      const state = getActiveNicheRuntimeState(process.env);
      respond(true, { state }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.runtime.stack": ({ params, respond }) => {
    try {
      const activeStackId = assertString(params.activeStackId, "activeStackId");
      const record = getActiveNicheStackRecord(activeStackId, process.env);
      if (!record) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Stack ${activeStackId} not found.`),
        );
        return;
      }
      respond(true, { stack: record }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.traces.list": ({ respond }) => {
    try {
      const traces = listRunTraces(process.env);
      respond(
        true,
        {
          traces: traces.map((t) => ({
            trace_id: t.trace_id,
            run_id: t.run_id,
            niche_program_id: t.niche_program_id,
            mode: t.mode,
            terminal_status: t.terminal_status,
            wall_clock_start_at: t.wall_clock_start_at,
            wall_clock_end_at: t.wall_clock_end_at,
          })),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.traces.get": ({ params, respond }) => {
    try {
      const traceId = assertString(params.traceId, "traceId");
      const trace = getRunTrace(traceId, process.env);
      if (!trace) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Trace ${traceId} not found.`),
        );
        return;
      }
      respond(true, { trace }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.release.rollback": ({ params, respond }) => {
    try {
      const activeStackId = assertString(params.activeStackId, "activeStackId");
      const agentId = assertString(params.agentId, "agentId");
      const nicheProgramId = assertString(params.nicheProgramId, "nicheProgramId");
      const rollbackTarget =
        typeof params.rollbackTarget === "string" && params.rollbackTarget.trim()
          ? params.rollbackTarget.trim()
          : null;
      const rawReason =
        typeof params.reason === "string" && params.reason.trim()
          ? params.reason.trim()
          : "Operator-initiated rollback via gateway.";
      const reason = sanitizeNicheTextField(rawReason);

      const result = executeRollback({
        activeStackId,
        agentId,
        nicheProgramId,
        rollbackTarget,
        reason,
        env: process.env,
      });

      respond(true, { rollback: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.list": async ({ respond }) => {
    try {
      const result = await nicheListCommand({ json: false });
      respond(true, { list: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.next": async ({ params, respond }) => {
    try {
      const nicheProgramId = assertString(params.nicheProgramId, "nicheProgramId");
      const result = await nicheNextCommand({ nicheProgramId, json: false });
      respond(true, { next: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.export": async ({ params, respond }) => {
    try {
      const nicheProgramIds = Array.isArray(params.nicheProgramIds)
        ? (params.nicheProgramIds as string[])
        : [];
      const out = assertString(params.out, "out");
      const result = await nicheExportCommand({ nicheProgramIds, out, json: false });
      respond(true, { export: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.import": async ({ params, respond }) => {
    try {
      const bundleDir = assertString(params.bundleDir, "bundleDir");
      const dryRun = Boolean(params.dryRun);
      const force = Boolean(params.force);
      const result = await nicheImportCommand({ bundleDir, dryRun, force, json: false });
      respond(true, { import: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.gc.preview": async ({ respond }) => {
    try {
      const result = await nicheGcCommand({ execute: false, json: false });
      respond(true, { gc: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.status": async ({ params, respond }) => {
    try {
      const nicheProgramId =
        typeof params.nicheProgramId === "string" && params.nicheProgramId.trim()
          ? params.nicheProgramId.trim()
          : undefined;
      const result = await nicheStatusCommand({ nicheProgramId, json: false });
      respond(true, { status: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.monitor.assess": ({ params, respond }) => {
    try {
      const activeStackId = assertString(params.activeStackId, "activeStackId");
      const agentId = assertString(params.agentId, "agentId");
      const nicheProgramId = assertString(params.nicheProgramId, "nicheProgramId");
      const rollbackTarget =
        typeof params.rollbackTarget === "string" && params.rollbackTarget.trim()
          ? params.rollbackTarget.trim()
          : null;

      const definitionValidation = validateJsonSchemaValue({
        schema: PromotedMonitorDefinitionSchema as unknown as Record<string, unknown>,
        cacheKey: "promoted-monitor-definition-gateway",
        value: params.definition,
      });
      if (!definitionValidation.ok) {
        const details = definitionValidation.errors.map((e) => e.text).join("; ");
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Invalid definition: ${details}`),
        );
        return;
      }

      const observationValidation = validateJsonSchemaValue({
        schema: PromotedMonitorObservationSchema as unknown as Record<string, unknown>,
        cacheKey: "promoted-monitor-observation-gateway",
        value: params.observation,
      });
      if (!observationValidation.ok) {
        const details = observationValidation.errors.map((e) => e.text).join("; ");
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Invalid observation: ${details}`),
        );
        return;
      }

      const definition = params.definition as PromotedMonitorDefinition;
      const observation = params.observation as PromotedMonitorObservation;

      const result = runMonitorAssessmentCycle({
        definition,
        agentId,
        activeStackId,
        nicheProgramId,
        rollbackTarget,
        collectObservation: () => observation,
        env: process.env,
      });

      respond(true, { monitor: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.verify": ({ respond }) => {
    try {
      const result = nicheVerify(process.env);
      respond(true, { verify: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.health": ({ respond }) => {
    try {
      const result = nicheHealthCheck(process.env);
      respond(true, { health: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.metrics": ({ respond }) => {
    try {
      const metrics = getNicheMetrics();
      const startTime = getNicheMetricsStartTime();
      respond(true, { metrics, start_time: startTime }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "niche.events.list": ({ params, respond }) => {
    try {
      const since = typeof params.since === "string" ? params.since : undefined;
      const limit = typeof params.limit === "number" ? params.limit : undefined;
      const events = readNicheEventLog({ since, limit });
      respond(true, { events }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
