import { describe, expect, it } from "vitest";
import { evaluateRepairDecision } from "../../../src/niche/action-policy/repair-policy.js";
import { mediateNicheToolCall } from "../../../src/niche/runtime/action-mediator.js";
import {
  clearAllNicheRunTraceContextsForTest,
  registerNicheRunTraceContext,
  snapshotNicheRunTraceContext,
} from "../../../src/niche/runtime/run-trace-capture.js";

describe("repair policy", () => {
  it("requests repair or escalation for blocked guard decisions", () => {
    expect(
      evaluateRepairDecision({
        guardDecision: {
          allowed: false,
          code: "domain_constraint_violation",
          reason: "Missing evidence context.",
          violations: ["must cite evidence"],
        },
        attemptIndex: 0,
        maxRepairAttempts: 1,
      }),
    ).toEqual({
      action: "repair",
      strategyId: "repair-domain_constraint_violation",
      reason: "Missing evidence context.",
    });

    expect(
      evaluateRepairDecision({
        guardDecision: {
          allowed: false,
          code: "permission_denied",
          reason: "Tool use denied.",
          violations: ["exec"],
        },
        attemptIndex: 1,
        maxRepairAttempts: 1,
      }),
    ).toEqual({
      action: "escalate",
      strategyId: "escalate-permission_denied",
      reason: "Tool use denied.",
    });
  });

  it("retries transient tool failures and stops after exhausted attempts", () => {
    expect(
      evaluateRepairDecision({
        guardDecision: {
          allowed: true,
          code: "allowed",
          reason: "Allowed",
          violations: [],
        },
        toolOutcome: {
          status: "failed",
          transient: true,
          errorMessage: "Temporary network timeout.",
        },
        attemptIndex: 0,
        maxRetryAttempts: 1,
      }),
    ).toEqual({
      action: "retry",
      strategyId: "retry-transient-failure",
      reason: "Temporary network timeout.",
    });

    expect(
      evaluateRepairDecision({
        guardDecision: {
          allowed: true,
          code: "allowed",
          reason: "Allowed",
          violations: [],
        },
        toolOutcome: {
          status: "failed",
          transient: false,
          errorMessage: "Permanent schema mismatch.",
        },
        attemptIndex: 1,
        maxRepairAttempts: 1,
      }),
    ).toEqual({
      action: "stop",
      strategyId: "stop-after-failure",
      reason: "Permanent schema mismatch.",
    });
  });
});

describe("action mediator and trace capture helpers", () => {
  it("emits persistable proposals into the run trace context", () => {
    clearAllNicheRunTraceContextsForTest();
    registerNicheRunTraceContext({
      runId: "run-1",
      nicheProgramId: "repo-ci-specialist",
      domainPackId: "repo-ci-pack",
      baselineOrCandidateManifestId: "candidate-manifest-repo-ci",
      actionPolicy: {
        allowedTools: ["read", "exec"],
        requiredArgumentsByTool: { exec: ["command"] },
      },
    });

    const result = mediateNicheToolCall({
      runId: "run-1",
      toolCallId: "tool-call-1",
      toolName: "exec",
      rawParams: { command: "pnpm lint" },
    });

    expect(result?.blocked).toBe(false);
    expect(result?.proposalId).toBe("tool-call-1");
    const snapshot = snapshotNicheRunTraceContext("run-1");
    expect(snapshot?.actionProposals).toHaveLength(1);
    expect(snapshot?.actionProposals[0]?.selected_tool).toBe("exec");
    expect(snapshot?.guardDecisions[0]?.code).toBe("allowed");
  });

  it("returns null and leaves no trace context when NicheClaw mode is inactive", () => {
    clearAllNicheRunTraceContextsForTest();
    const result = mediateNicheToolCall({
      runId: "run-without-niche",
      toolCallId: "tool-call-2",
      toolName: "read",
      rawParams: { path: "README.md" },
    });

    expect(result).toBeNull();
    expect(snapshotNicheRunTraceContext("run-without-niche")).toBeUndefined();
  });
});
