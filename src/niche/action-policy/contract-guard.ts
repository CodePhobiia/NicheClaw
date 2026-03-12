import type { GuardDecision } from "./types.js";

export function evaluateActionGuard(params: {
  toolName: string;
  allowedTools: string[];
  schemaAvailable: boolean;
  permissionAllowed: boolean;
  domainConstraintViolations?: string[];
  releaseConstraintViolations?: string[];
}): GuardDecision {
  const domainConstraintViolations = params.domainConstraintViolations ?? [];
  const releaseConstraintViolations = params.releaseConstraintViolations ?? [];

  if (!params.allowedTools.includes(params.toolName)) {
    return {
      allowed: false,
      code: "tool_not_allowed",
      reason: `Tool "${params.toolName}" is not in the allowed tool set.`,
      violations: [params.toolName],
    };
  }

  if (!params.schemaAvailable) {
    return {
      allowed: false,
      code: "missing_schema",
      reason: `Tool "${params.toolName}" is missing a usable schema contract.`,
      violations: [params.toolName],
    };
  }

  if (!params.permissionAllowed) {
    return {
      allowed: false,
      code: "permission_denied",
      reason: `Tool "${params.toolName}" is not permitted under the current execution policy.`,
      violations: [params.toolName],
    };
  }

  if (domainConstraintViolations.length > 0) {
    return {
      allowed: false,
      code: "domain_constraint_violation",
      reason: "The proposed action violates domain constraints.",
      violations: [...domainConstraintViolations],
    };
  }

  if (releaseConstraintViolations.length > 0) {
    return {
      allowed: false,
      code: "release_constraint_violation",
      reason: "The proposed action violates release constraints.",
      violations: [...releaseConstraintViolations],
    };
  }

  return {
    allowed: true,
    code: "allowed",
    reason: `Tool "${params.toolName}" is valid for this action.`,
    violations: [],
  };
}
