import { getCompiledDomainConfig } from "./run-trace-capture.js";

export type ConstraintCheckResult = {
  passed: boolean;
  violations: Array<{
    constraint_id: string;
    rule: string;
    severity: string;
    blocking: boolean;
  }>;
};

export function checkDomainConstraints(runId: string, content: string): ConstraintCheckResult {
  const config = getCompiledDomainConfig(runId);
  if (!config) {
    return { passed: true, violations: [] };
  }

  const violations: ConstraintCheckResult["violations"] = [];
  const contentLower = content.toLowerCase();

  for (const constraint of config.constraints) {
    const rule = constraint.rule;
    let violated = false;

    if (rule.startsWith("must_include:")) {
      const required = rule.slice("must_include:".length);
      if (!contentLower.includes(required.toLowerCase())) {
        violated = true;
      }
    } else if (rule.startsWith("must_not_include:")) {
      const forbidden = rule.slice("must_not_include:".length);
      if (contentLower.includes(forbidden.toLowerCase())) {
        violated = true;
      }
    } else if (rule.startsWith("must_ground_in_evidence")) {
      // Meta-constraint handled by the verifier gate; skip here.
      continue;
    } else {
      // Unknown rule format — reserved for future extension; skip.
      continue;
    }

    if (violated) {
      const blocking = constraint.severity === "high" || constraint.severity === "critical";
      violations.push({
        constraint_id: constraint.constraint_id,
        rule: constraint.rule,
        severity: constraint.severity,
        blocking,
      });
    }
  }

  return {
    passed: violations.every((v) => !v.blocking),
    violations,
  };
}
