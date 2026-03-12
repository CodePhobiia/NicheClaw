import { describe, expect, it } from "vitest";
import {
  evaluateActionGuard,
  selectActionProposal,
} from "../../../src/niche/action-policy/index.js";

describe("contract guard", () => {
  it("blocks actions that violate tool, schema, permission, domain, or release rules", () => {
    expect(
      evaluateActionGuard({
        toolName: "exec",
        allowedTools: ["read"],
        schemaAvailable: true,
        permissionAllowed: true,
      }),
    ).toMatchObject({
      allowed: false,
      code: "tool_not_allowed",
    });

    expect(
      evaluateActionGuard({
        toolName: "read",
        allowedTools: ["read"],
        schemaAvailable: false,
        permissionAllowed: true,
      }),
    ).toMatchObject({
      allowed: false,
      code: "missing_schema",
    });

    expect(
      evaluateActionGuard({
        toolName: "read",
        allowedTools: ["read"],
        schemaAvailable: true,
        permissionAllowed: false,
      }),
    ).toMatchObject({
      allowed: false,
      code: "permission_denied",
    });

    expect(
      evaluateActionGuard({
        toolName: "read",
        allowedTools: ["read"],
        schemaAvailable: true,
        permissionAllowed: true,
        domainConstraintViolations: ["must cite evidence"],
      }),
    ).toMatchObject({
      allowed: false,
      code: "domain_constraint_violation",
    });

    expect(
      evaluateActionGuard({
        toolName: "read",
        allowedTools: ["read"],
        schemaAvailable: true,
        permissionAllowed: true,
        releaseConstraintViolations: ["release is frozen"],
      }),
    ).toMatchObject({
      allowed: false,
      code: "release_constraint_violation",
    });
  });

  it("allows valid actions deterministically", () => {
    expect(
      evaluateActionGuard({
        toolName: "exec",
        allowedTools: ["read", "exec"],
        schemaAvailable: true,
        permissionAllowed: true,
      }),
    ).toEqual({
      allowed: true,
      code: "allowed",
      reason: 'Tool "exec" is valid for this action.',
      violations: [],
    });
  });
});

describe("tool selector", () => {
  it("ranks candidates and emits a structured action proposal", () => {
    const proposal = selectActionProposal({
      proposalId: "proposal-1",
      guardDecision: {
        allowed: true,
        code: "allowed",
        reason: "Allowed",
        violations: [],
      },
      attemptIndex: 0,
      candidates: [
        {
          tool_name: "read",
          rationale: "Can inspect the file quickly.",
          required_argument_names: ["path"],
          provided_argument_names: ["path"],
          domain_match_score: 0.6,
          reliability_score: 0.4,
          risk_score: 0.1,
        },
        {
          tool_name: "exec",
          rationale: "Can reproduce the failing command directly.",
          required_argument_names: ["command"],
          provided_argument_names: ["command"],
          domain_match_score: 0.9,
          reliability_score: 0.5,
          risk_score: 0.2,
        },
      ],
    });

    expect(proposal.selected_tool).toBe("exec");
    expect(proposal.guard_decision).toBe("allowed");
    expect(proposal.candidate_rankings[0]?.tool_name).toBe("exec");
    expect(proposal.selector_score).toBeGreaterThan(proposal.candidate_rankings[1]?.score ?? 0);
  });

  it("preserves blocked guard state and missing-argument penalties in the proposal", () => {
    const proposal = selectActionProposal({
      proposalId: "proposal-2",
      guardDecision: {
        allowed: false,
        code: "domain_constraint_violation",
        reason: "The action is missing required evidence context.",
        violations: ["must cite evidence"],
      },
      repairStrategyId: "repair-1",
      attemptIndex: 1,
      previousAttemptRef: "proposal-1",
      candidates: [
        {
          tool_name: "read",
          rationale: "Read the evidence file first.",
          required_argument_names: ["path"],
          provided_argument_names: [],
          domain_match_score: 0.8,
          reliability_score: 0.4,
          risk_score: 0.1,
        },
      ],
    });

    expect(proposal.guard_decision).toBe("domain_constraint_violation");
    expect(proposal.guard_failure_reason).toMatch(/missing required evidence context/i);
    expect(proposal.repair_strategy_id).toBe("repair-1");
    expect(proposal.previous_attempt_ref).toBe("proposal-1");
    expect(proposal.candidate_rankings[0]?.missing_required_arguments).toEqual(["path"]);
  });
});
