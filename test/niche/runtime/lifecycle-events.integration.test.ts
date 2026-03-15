import { afterEach, describe, expect, it, vi } from "vitest";
import { emitNicheLifecycleEvent } from "../../../src/niche/runtime/lifecycle-events.js";
import {
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
} from "../../../src/plugins/hook-runner-global.js";
import type { PluginRegistry } from "../../../src/plugins/registry.js";

afterEach(() => {
  resetGlobalHookRunner();
});

describe("niche lifecycle hook integration", () => {
  it("runs a registered niche_lifecycle hook through the real global hook runner", async () => {
    const handler = vi.fn(async () => {});
    const registry: PluginRegistry = {
      plugins: [],
      tools: [],
      hooks: [],
      typedHooks: [
        {
          pluginId: "test-plugin",
          hookName: "niche_lifecycle",
          handler,
          source: "test",
        },
      ],
      channels: [],
      providers: [],
      gatewayHandlers: {},
      httpRoutes: [],
      cliRegistrars: [],
      services: [],
      commands: [],
      diagnostics: [],
    };

    initializeGlobalHookRunner(registry);

    await emitNicheLifecycleEvent({
      event_type: "planner_proposed",
      run_id: "run-integration-1",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-repo-ci",
      payload: {
        selected_manifest_id: "candidate-manifest-repo-ci",
        planner_runtime_component_id: "planner-primary-v1",
      },
      ctx: {
        sessionId: "session-123",
      },
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "planner_proposed",
        candidate_manifest_id: "candidate-manifest-repo-ci",
      }),
      expect.objectContaining({
        trigger: "niche",
        sessionId: "session-123",
      }),
    );
  });

  it("does not throw when no hook runner is initialized", async () => {
    // resetGlobalHookRunner already called in afterEach, so no runner is set
    resetGlobalHookRunner();

    // Should complete without throwing
    await expect(
      emitNicheLifecycleEvent({
        event_type: "planner_proposed",
        run_id: "run-no-runner",
        niche_program_id: "repo-ci-specialist",
        payload: {
          selected_manifest_id: "candidate-manifest-no-runner",
          planner_runtime_component_id: "planner-primary-v1",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("delivers multiple events emitted sequentially", async () => {
    const handler = vi.fn(async () => {});
    const registry: PluginRegistry = {
      plugins: [],
      tools: [],
      hooks: [],
      typedHooks: [
        {
          pluginId: "test-plugin",
          hookName: "niche_lifecycle",
          handler,
          source: "test",
        },
      ],
      channels: [],
      providers: [],
      gatewayHandlers: {},
      httpRoutes: [],
      cliRegistrars: [],
      services: [],
      commands: [],
      diagnostics: [],
    };

    initializeGlobalHookRunner(registry);

    await emitNicheLifecycleEvent({
      event_type: "planner_proposed",
      run_id: "run-multi-1",
      niche_program_id: "repo-ci-specialist",
      payload: {
        selected_manifest_id: "manifest-1",
        planner_runtime_component_id: "planner-primary-v1",
      },
    });

    await emitNicheLifecycleEvent({
      event_type: "planner_proposed",
      run_id: "run-multi-2",
      niche_program_id: "repo-ci-specialist",
      payload: {
        selected_manifest_id: "manifest-2",
        planner_runtime_component_id: "planner-primary-v1",
      },
    });

    await emitNicheLifecycleEvent({
      event_type: "candidate_promoted",
      run_id: "run-multi-3",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-3",
      payload: {
        candidate_release_id: "release-3",
        rollback_target: "baseline-3",
      },
    });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ run_id: "run-multi-1" }),
      expect.anything(),
    );
    expect(handler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ run_id: "run-multi-2" }),
      expect.anything(),
    );
    expect(handler).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ event_type: "candidate_promoted" }),
      expect.anything(),
    );
  });

  it("emits candidate_promoted, candidate_rolled_back, and run_trace_persisted event types", async () => {
    const handler = vi.fn(async () => {});
    const registry: PluginRegistry = {
      plugins: [],
      tools: [],
      hooks: [],
      typedHooks: [
        {
          pluginId: "test-plugin",
          hookName: "niche_lifecycle",
          handler,
          source: "test",
        },
      ],
      channels: [],
      providers: [],
      gatewayHandlers: {},
      httpRoutes: [],
      cliRegistrars: [],
      services: [],
      commands: [],
      diagnostics: [],
    };

    initializeGlobalHookRunner(registry);

    await emitNicheLifecycleEvent({
      event_type: "candidate_promoted",
      run_id: "run-promoted",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-promoted",
      payload: {
        candidate_release_id: "release-promoted",
        rollback_target: "baseline-release-promoted",
      },
    });

    await emitNicheLifecycleEvent({
      event_type: "candidate_rolled_back",
      run_id: "run-rollback",
      niche_program_id: "repo-ci-specialist",
      candidate_manifest_id: "candidate-manifest-rollback",
      payload: {
        rolled_back_stack_id: "stack-rollback",
        rollback_target: "baseline-release-rollback",
        reason: "Drift exceeded threshold.",
        overlays_cleared: 2,
      },
    });

    await emitNicheLifecycleEvent({
      event_type: "run_trace_persisted",
      run_id: "run-trace",
      niche_program_id: "repo-ci-specialist",
      payload: {
        trace_id: "trace-001",
        replayability_status: "non_replayable",
        persisted_path: "/tmp/traces/trace-001.json",
      },
    });

    expect(handler).toHaveBeenCalledTimes(3);
    const eventTypes = handler.mock.calls.map((call: unknown[]) => (call[0] as { event_type: string }).event_type);
    expect(eventTypes).toContain("candidate_promoted");
    expect(eventTypes).toContain("candidate_rolled_back");
    expect(eventTypes).toContain("run_trace_persisted");
  });

  it("does not crash the emitter when hook handler throws", async () => {
    const throwingHandler = vi.fn(async () => {
      throw new Error("Hook handler exploded");
    });
    const registry: PluginRegistry = {
      plugins: [],
      tools: [],
      hooks: [],
      typedHooks: [
        {
          pluginId: "test-plugin",
          hookName: "niche_lifecycle",
          handler: throwingHandler,
          source: "test",
        },
      ],
      channels: [],
      providers: [],
      gatewayHandlers: {},
      httpRoutes: [],
      cliRegistrars: [],
      services: [],
      commands: [],
      diagnostics: [],
    };

    initializeGlobalHookRunner(registry);

    // The emitter catches hook errors internally and does not propagate them
    await expect(
      emitNicheLifecycleEvent({
        event_type: "planner_proposed",
        run_id: "run-throw-handler",
        niche_program_id: "repo-ci-specialist",
        payload: {
          selected_manifest_id: "candidate-manifest-throw",
          planner_runtime_component_id: "planner-primary-v1",
        },
      }),
    ).resolves.toBeUndefined();

    // Handler was still invoked even though it threw
    expect(throwingHandler).toHaveBeenCalledTimes(1);
  });
});
