import { readRequiredJsonFileStrict } from "../../niche/json.js";
import {
  PromotedMonitorDefinitionSchema,
  type PromotedMonitorDefinition,
  type PromotedMonitorObservation,
} from "../../niche/release/index.js";
import {
  runMonitorAssessmentCycle,
  type MonitorCycleResult,
} from "../../niche/release/monitor-service.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";

export type NicheMonitorOptions = {
  activeStackId: string;
  agentId: string;
  nicheProgramId: string;
  monitorDefinitionPath: string;
  interval: number;
  rollbackTarget?: string;
  json: boolean;
};

function loadMonitorDefinition(pathname: string): PromotedMonitorDefinition {
  const raw = readRequiredJsonFileStrict(pathname);
  const validation = validateJsonSchemaValue({
    schema: PromotedMonitorDefinitionSchema,
    cacheKey: "niche-cli-monitor-definition",
    value: raw,
  });
  if (!validation.ok) {
    const details = validation.errors.map((e) => e.text).join("; ");
    throw new Error(`Invalid monitor definition: ${details}`);
  }
  return raw as PromotedMonitorDefinition;
}

/** Minimal observation collector that returns null (no runtime drift data available from CLI). */
function cliObservationCollector(): PromotedMonitorObservation | null {
  return null;
}

function formatCycleResult(result: MonitorCycleResult): string {
  if (result.skipped_reason) {
    return `[monitor] stack=${result.active_stack_id} skipped: ${result.skipped_reason}`;
  }
  const parts = [
    `[monitor] stack=${result.active_stack_id}`,
    `rollback=${result.assessment?.should_rollback ? "yes" : "no"}`,
    `cooldown=${result.assessment?.cooldown_active ? "yes" : "no"}`,
    `breached=${result.assessment?.breached_dimensions.join(",") || "none"}`,
  ];
  if (result.rollback) {
    parts.push(`rollback_result=${result.rollback.status}`);
  }
  return parts.join("  ");
}

export async function nicheMonitorCommand(opts: NicheMonitorOptions): Promise<MonitorCycleResult> {
  const definition = loadMonitorDefinition(opts.monitorDefinitionPath);

  const runCycle = (): MonitorCycleResult =>
    runMonitorAssessmentCycle({
      definition,
      agentId: opts.agentId,
      activeStackId: opts.activeStackId,
      nicheProgramId: opts.nicheProgramId,
      rollbackTarget: opts.rollbackTarget ?? null,
      collectObservation: cliObservationCollector,
      env: process.env,
    });

  // Single-shot mode
  if (opts.interval <= 0) {
    const result = runCycle();
    console.log(opts.json ? JSON.stringify(result, null, 2) : formatCycleResult(result));
    return result;
  }

  // Repeating mode
  let lastResult = runCycle();
  console.log(opts.json ? JSON.stringify(lastResult, null, 2) : formatCycleResult(lastResult));

  const intervalMs = opts.interval * 1000;
  const timer = setInterval(() => {
    lastResult = runCycle();
    console.log(opts.json ? JSON.stringify(lastResult, null, 2) : formatCycleResult(lastResult));
  }, intervalMs);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      clearInterval(timer);
      resolve();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

  return lastResult;
}
