import { emitNicheLifecycleEvent } from "../runtime/lifecycle-events.js";
import type { ActiveNicheStackRecord, NicheStackReleaseMode } from "../schema/index.js";
import {
  clearRouteOverlaysForStack,
  getActiveNicheStackRecord,
  removeActiveNicheAgentDefault,
  setActiveNicheAgentDefault,
  upsertActiveNicheStackRecord,
} from "../store/active-stack-store.js";
import type { PromotionControllerResult } from "./promotion-controller.js";

export type ReleaseActuationResult = {
  actuated: boolean;
  decision: string;
  active_stack_id: string | null;
  release_mode: NicheStackReleaseMode | null;
  agent_default_set: boolean;
  reason: string;
};

export type RollbackResult = {
  rolled_back: boolean;
  previous_stack_id: string;
  rollback_target: string | null;
  overlays_cleared: number;
  agent_default_reverted: boolean;
  reason: string;
};

function decisionToReleaseMode(decision: string): NicheStackReleaseMode | null {
  switch (decision) {
    case "promoted":
      return "live";
    case "canary":
      return "canary";
    case "shadow":
      return "shadow";
    default:
      return null;
  }
}

export function actuateReleaseDecision(params: {
  promotionResult: PromotionControllerResult;
  stackRecord: ActiveNicheStackRecord;
  agentId: string;
  env?: NodeJS.ProcessEnv;
}): ReleaseActuationResult {
  const { promotionResult, stackRecord, agentId, env } = params;
  const releaseMode = decisionToReleaseMode(promotionResult.decision);

  if (!releaseMode) {
    return {
      actuated: false,
      decision: promotionResult.decision,
      active_stack_id: null,
      release_mode: null,
      agent_default_set: false,
      reason: promotionResult.reason,
    };
  }

  const updatedRecord: ActiveNicheStackRecord = {
    ...stackRecord,
    release_mode: releaseMode,
    registered_at: new Date().toISOString(),
    ...(releaseMode === "canary" ? { canary_fraction: stackRecord.canary_fraction ?? 0.1 } : {}),
    ...(releaseMode === "shadow"
      ? { shadow_dual_execute: stackRecord.shadow_dual_execute ?? true }
      : {}),
  };

  upsertActiveNicheStackRecord(updatedRecord, env);

  let agentDefaultSet = false;
  if (releaseMode === "live") {
    setActiveNicheAgentDefault(
      {
        agent_id: agentId,
        active_stack_id: updatedRecord.active_stack_id,
        updated_at: new Date().toISOString(),
      },
      env,
    );
    agentDefaultSet = true;
  }

  const candidateRelease = promotionResult.candidate_release;
  if (releaseMode === "live") {
    void emitNicheLifecycleEvent({
      event_type: "candidate_promoted",
      run_id: candidateRelease.candidate_release_id,
      niche_program_id: candidateRelease.niche_program_id,
      baseline_manifest_id: candidateRelease.stack_manifest.baseline_manifest_id,
      candidate_manifest_id: candidateRelease.stack_manifest.candidate_manifest_id,
      payload: {
        candidate_release_id: candidateRelease.candidate_release_id,
        rollback_target: candidateRelease.rollback_target,
      },
    });
  }

  return {
    actuated: true,
    decision: promotionResult.decision,
    active_stack_id: updatedRecord.active_stack_id,
    release_mode: releaseMode,
    agent_default_set: agentDefaultSet,
    reason: promotionResult.reason,
  };
}

export function executeRollback(params: {
  activeStackId: string;
  agentId: string;
  nicheProgramId: string;
  rollbackTarget: string | null;
  reason: string;
  env?: NodeJS.ProcessEnv;
}): RollbackResult {
  const { activeStackId, agentId, rollbackTarget, reason, env } = params;

  const existingRecord = getActiveNicheStackRecord(activeStackId, env);
  if (!existingRecord) {
    return {
      rolled_back: false,
      previous_stack_id: activeStackId,
      rollback_target: rollbackTarget,
      overlays_cleared: 0,
      agent_default_reverted: false,
      reason: `Stack ${activeStackId} not found in active runtime state.`,
    };
  }

  const overlaysCleared = clearRouteOverlaysForStack(activeStackId, env);

  const agentDefaultReverted = removeActiveNicheAgentDefault(agentId, env);

  const deactivated = { ...existingRecord, release_mode: "rolled_back" as const };
  upsertActiveNicheStackRecord(deactivated, env);

  if (rollbackTarget) {
    const targetRecord = getActiveNicheStackRecord(rollbackTarget, env);
    if (targetRecord) {
      setActiveNicheAgentDefault(
        {
          agent_id: agentId,
          active_stack_id: rollbackTarget,
          updated_at: new Date().toISOString(),
        },
        env,
      );
    }
  }

  void emitNicheLifecycleEvent({
    event_type: "candidate_rolled_back",
    run_id: activeStackId,
    niche_program_id: params.nicheProgramId,
    payload: {
      rolled_back_stack_id: activeStackId,
      rollback_target: rollbackTarget ?? "none",
      reason,
      overlays_cleared: overlaysCleared,
    },
  });

  return {
    rolled_back: true,
    previous_stack_id: activeStackId,
    rollback_target: rollbackTarget,
    overlays_cleared: overlaysCleared,
    agent_default_reverted: agentDefaultReverted,
    reason,
  };
}
