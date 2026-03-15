import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getActiveNicheRuntimeState } from "../store/active-stack-store.js";
import {
  assessPromotedReleaseMonitor,
  type PromotedMonitorAssessment,
  type PromotedMonitorDefinition,
  type PromotedMonitorObservation,
} from "./promoted-monitor.js";
import { executeRollback, type RollbackResult } from "./release-controller.js";

const log = createSubsystemLogger("niche/release/monitor");

export type MonitorObservationCollector = (params: {
  definition: PromotedMonitorDefinition;
  agentId: string;
  activeStackId: string;
  env?: NodeJS.ProcessEnv;
}) => PromotedMonitorObservation | null;

export type MonitorCycleResult = {
  active_stack_id: string;
  agent_id: string;
  assessment: PromotedMonitorAssessment | null;
  rollback: RollbackResult | null;
  skipped_reason: string | null;
};

export function runMonitorAssessmentCycle(params: {
  definition: PromotedMonitorDefinition;
  agentId: string;
  activeStackId: string;
  nicheProgramId: string;
  rollbackTarget: string | null;
  collectObservation: MonitorObservationCollector;
  env?: NodeJS.ProcessEnv;
}): MonitorCycleResult {
  const {
    definition,
    agentId,
    activeStackId,
    nicheProgramId,
    rollbackTarget,
    collectObservation,
    env,
  } = params;

  const state = getActiveNicheRuntimeState(env);
  const stackRecord = state.stacks.find((record) => record.active_stack_id === activeStackId);
  if (!stackRecord) {
    return {
      active_stack_id: activeStackId,
      agent_id: agentId,
      assessment: null,
      rollback: null,
      skipped_reason: `Stack ${activeStackId} not found in active runtime state.`,
    };
  }

  if (stackRecord.release_mode !== "live") {
    return {
      active_stack_id: activeStackId,
      agent_id: agentId,
      assessment: null,
      rollback: null,
      skipped_reason: `Stack ${activeStackId} is in ${stackRecord.release_mode} mode, not live. Monitor skipped.`,
    };
  }

  const observation = collectObservation({
    definition,
    agentId,
    activeStackId,
    env,
  });
  if (!observation) {
    return {
      active_stack_id: activeStackId,
      agent_id: agentId,
      assessment: null,
      rollback: null,
      skipped_reason: "Observation collector returned null; no data available for assessment.",
    };
  }

  const assessment = assessPromotedReleaseMonitor({
    definition,
    observation,
  });

  if (!assessment.should_rollback) {
    return {
      active_stack_id: activeStackId,
      agent_id: agentId,
      assessment,
      rollback: null,
      skipped_reason: null,
    };
  }

  log.info(
    `Monitor assessment for stack ${activeStackId} triggered rollback. Breached: ${assessment.breached_dimensions.join(", ")}`,
  );

  const rollbackResult = executeRollback({
    activeStackId,
    agentId,
    nicheProgramId,
    rollbackTarget,
    reason: `Monitor-triggered rollback: breached dimensions [${assessment.breached_dimensions.join(", ")}]`,
    env,
  });

  return {
    active_stack_id: activeStackId,
    agent_id: agentId,
    assessment,
    rollback: rollbackResult,
    skipped_reason: null,
  };
}
