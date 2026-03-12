import { describe, expect, it } from "vitest";
import type { ToolHandlerContext } from "../../../src/agents/pi-embedded-subscribe.handlers.types.js";
import {
  handleToolExecutionEnd,
  handleToolExecutionStart,
  handleToolExecutionUpdate,
} from "../../../src/agents/pi-embedded-subscribe.handlers.tools.js";
import { wrapToolWithBeforeToolCallHook } from "../../../src/agents/pi-tools.before-tool-call.js";
import type { AnyAgentTool } from "../../../src/agents/tools/common.js";
import {
  attachNicheRunAttemptMetadata,
  clearAllNicheRunTraceContextsForTest,
  registerNicheRunTraceContext,
  snapshotNicheRunTraceContext,
} from "../../../src/niche/runtime/run-trace-capture.js";

function makeToolHandlerContext(): ToolHandlerContext {
  return {
    params: {
      runId: "run-1",
      sessionKey: "session-main",
      sessionId: "session-main",
      agentId: "agent-main",
    },
    state: {
      toolMetaById: new Map(),
      toolMetas: [],
      toolSummaryById: new Set(),
      pendingMessagingTargets: new Map(),
      pendingMessagingTexts: new Map(),
      pendingMessagingMediaUrls: new Map(),
      messagingToolSentTexts: [],
      messagingToolSentTextsNormalized: [],
      messagingToolSentMediaUrls: [],
      messagingToolSentTargets: [],
      successfulCronAdds: 0,
      deterministicApprovalPromptSent: false,
    },
    log: {
      debug: () => {},
      warn: () => {},
    },
    flushBlockReplyBuffer: () => {},
    shouldEmitToolResult: () => false,
    shouldEmitToolOutput: () => false,
    emitToolSummary: () => {},
    emitToolOutput: () => {},
    trimMessagingToolSent: () => {},
  };
}

describe("Sprint 5.3 action wiring", () => {
  it("invokes the mediator and records an action proposal when NicheClaw mode is active", async () => {
    clearAllNicheRunTraceContextsForTest();
    registerNicheRunTraceContext({
      runId: "run-1",
      nicheProgramId: "repo-ci-specialist",
      domainPackId: "repo-ci-pack",
      baselineOrCandidateManifestId: "candidate-manifest-repo-ci",
      actionPolicy: {
        allowedTools: ["exec"],
        requiredArgumentsByTool: { exec: ["command"] },
      },
    });

    const tool: AnyAgentTool = {
      name: "exec",
      label: "Exec",
      parameters: {},
      execute: async () => ({
        content: [{ type: "text", text: "ok" }],
      }),
    };

    const wrapped = wrapToolWithBeforeToolCallHook(tool, { runId: "run-1" });
    await wrapped.execute?.("tool-call-1", { command: "pnpm lint" }, undefined, undefined);

    const snapshot = snapshotNicheRunTraceContext("run-1");
    expect(snapshot?.actionProposals).toHaveLength(1);
    expect(snapshot?.actionProposals[0]?.selected_tool).toBe("exec");
    expect(snapshot?.guardDecisions[0]?.code).toBe("allowed");
  });

  it("captures tool execution start, update, and result events", async () => {
    clearAllNicheRunTraceContextsForTest();
    registerNicheRunTraceContext({
      runId: "run-1",
      nicheProgramId: "repo-ci-specialist",
      domainPackId: "repo-ci-pack",
      baselineOrCandidateManifestId: "candidate-manifest-repo-ci",
      actionPolicy: {
        allowedTools: ["exec"],
      },
    });
    attachNicheRunAttemptMetadata({
      runId: "run-1",
      sessionId: "session-main",
      sessionKey: "session-main",
      agentId: "agent-main",
      provider: "openai",
      modelId: "gpt-5",
    });

    const ctx = makeToolHandlerContext();
    await handleToolExecutionStart(ctx, {
      type: "tool_execution_start",
      toolName: "exec",
      toolCallId: "tool-call-1",
      args: { command: "pnpm lint" },
    });
    handleToolExecutionUpdate(ctx, {
      type: "tool_execution_update",
      toolName: "exec",
      toolCallId: "tool-call-1",
      partialResult: { text: "running" },
    });
    await handleToolExecutionEnd(ctx, {
      type: "tool_execution_end",
      toolName: "exec",
      toolCallId: "tool-call-1",
      isError: false,
      result: { ok: true, output: "done" },
    });

    const snapshot = snapshotNicheRunTraceContext("run-1");
    expect(snapshot?.sessionId).toBe("session-main");
    expect(snapshot?.provider).toBe("openai");
    expect(snapshot?.toolEvents.map((event) => event.phase)).toEqual([
      "start",
      "update",
      "result",
    ]);
  });

  it("preserves existing behavior when NicheClaw mode is inactive", async () => {
    clearAllNicheRunTraceContextsForTest();

    let executed = false;
    const tool: AnyAgentTool = {
      name: "exec",
      label: "Exec",
      parameters: {},
      execute: async () => {
        executed = true;
        return {
          content: [{ type: "text", text: "ok" }],
        };
      },
    };

    const wrapped = wrapToolWithBeforeToolCallHook(tool, { runId: "run-without-niche" });
    await wrapped.execute?.("tool-call-2", { command: "pnpm lint" }, undefined, undefined);

    expect(executed).toBe(true);
    expect(snapshotNicheRunTraceContext("run-without-niche")).toBeUndefined();
  });
});
