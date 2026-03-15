import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { validateJsonSchemaValue } from "../../plugins/schema-validator.js";
import type { PluginHookAgentContext } from "../../plugins/types.js";
import { computeStableContentHash } from "../benchmark/fixture-versioning.js";
import { LifecycleEventSchema, type LifecycleEventType } from "../contracts/lifecycle.js";
import { appendNicheEventLog } from "../event-log.js";
import { incrementNicheMetric } from "../metrics.js";
import { appendAuditEntry } from "../store/audit-log.js";

const log = createSubsystemLogger("niche/runtime/lifecycle");

export function emitNicheLifecycleEvent(params: {
  event_type: LifecycleEventType;
  occurred_at?: string;
  run_id: string;
  niche_program_id: string;
  baseline_manifest_id?: string;
  candidate_manifest_id?: string;
  payload: unknown;
  ctx?: PluginHookAgentContext;
}): Promise<void> {
  const occurredAt = params.occurred_at ?? new Date().toISOString();
  const event = {
    event_id: `niche-lifecycle-${computeStableContentHash({
      event_type: params.event_type,
      occurred_at: occurredAt,
      run_id: params.run_id,
      niche_program_id: params.niche_program_id,
      payload: params.payload,
    }).slice(0, 24)}`,
    event_type: params.event_type,
    occurred_at: occurredAt,
    run_id: params.run_id,
    niche_program_id: params.niche_program_id,
    baseline_manifest_id: params.baseline_manifest_id,
    candidate_manifest_id: params.candidate_manifest_id,
    payload: params.payload,
  };
  const validation = validateJsonSchemaValue({
    schema: LifecycleEventSchema,
    cacheKey: "niche-runtime-lifecycle-event",
    value: event,
  });
  if (!validation.ok) {
    const details = validation.errors.map((error) => error.text).join("; ");
    throw new Error(`Invalid niche lifecycle event: ${details}`);
  }
  try {
    appendAuditEntry({
      event_id: event.event_id,
      event_type: event.event_type,
      occurred_at: event.occurred_at,
      actor: "system",
      niche_program_id: event.niche_program_id,
      run_id: event.run_id,
      payload_summary: JSON.stringify(event.payload).slice(0, 500),
    });
  } catch (auditError) {
    log.warn(`audit log append failed: ${String(auditError)}`);
  }

  // OR-05: Append to event log
  try {
    appendNicheEventLog(event);
  } catch (eventLogError) {
    log.warn(`event log append failed: ${String(eventLogError)}`);
  }

  // OR-04: Increment metrics counters by event type
  const metricMap: Partial<Record<LifecycleEventType, string>> = {
    candidate_promoted: "promotions_total",
    candidate_rolled_back: "rollbacks_total",
    benchmark_case_started: "benchmarks_total",
    run_trace_persisted: "traces_total",
  };
  const metricName = metricMap[params.event_type];
  if (metricName) {
    incrementNicheMetric(metricName);
  }

  const hookRunner = getGlobalHookRunner();
  if (!hookRunner?.hasHooks("niche_lifecycle")) {
    return Promise.resolve();
  }
  return hookRunner
    .runNicheLifecycle(event as Parameters<typeof hookRunner.runNicheLifecycle>[0], {
      trigger: "niche",
      ...params.ctx,
    })
    .catch((error) => {
      log.warn(`niche_lifecycle hook failed: ${String(error)}`);
    });
}
