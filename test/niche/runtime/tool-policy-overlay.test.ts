import { describe, expect, it } from "vitest";
import { resolveNicheToolPolicy } from "../../../src/agents/pi-tools.policy.js";
import type { AnyAgentTool } from "../../../src/agents/pi-tools.types.js";
import { applyToolPolicyPipeline } from "../../../src/agents/tool-policy-pipeline.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";

function makeTool(name: string): AnyAgentTool {
  return {
    name,
    label: name,
    parameters: {},
  };
}

describe("niche tool policy overlay", () => {
  it("reuses the shared tool-policy pipeline to restrict tools for active Niche stacks", () => {
    const tools = [makeTool("read"), makeTool("exec"), makeTool("apply_patch")];
    const nicheRunSeed = {
      action_policy_runtime: {
        allowed_tools: ["exec"],
      },
    } as PreparedNicheRunSeed;

    const filtered = applyToolPolicyPipeline({
      tools,
      toolMeta: () => undefined,
      warn: () => {},
      steps: [
        {
          policy: {
            allow: ["read", "exec", "apply_patch"],
          },
          label: "global tools.allow",
        },
        {
          policy: resolveNicheToolPolicy(nicheRunSeed),
          label: "niche action policy",
        },
      ],
    });

    expect(filtered.map((tool) => tool.name)).toEqual(["exec", "apply_patch"]);
  });

  it("does not alter the tool surface when no active Niche seed is present", () => {
    const tools = [makeTool("read"), makeTool("exec")];

    const filtered = applyToolPolicyPipeline({
      tools,
      toolMeta: () => undefined,
      warn: () => {},
      steps: [
        {
          policy: {
            allow: ["read", "exec"],
          },
          label: "global tools.allow",
        },
        {
          policy: resolveNicheToolPolicy(undefined),
          label: "niche action policy",
        },
      ],
    });

    expect(filtered.map((tool) => tool.name)).toEqual(["read", "exec"]);
  });
});
