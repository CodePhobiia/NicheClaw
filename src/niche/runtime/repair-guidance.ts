import { getCompiledDomainConfig, getNicheRunTraceContext } from "./run-trace-capture.js";

const DEFAULT_MAX_REPAIR_ATTEMPTS = 2;

export function buildDomainRepairPrompt(params: {
  runId: string;
  findings: Array<{
    finding_id: string;
    category: string;
    severity: string;
    message: string;
  }>;
  originalOutput: string;
}): string | null {
  const config = getCompiledDomainConfig(params.runId);
  if (!config) {
    return null;
  }

  const constraintsByIdOrCategory = new Map<
    string,
    { constraint_id: string; category: string; rule: string; severity: string; rationale?: string }
  >();
  for (const constraint of config.constraints) {
    constraintsByIdOrCategory.set(constraint.constraint_id, constraint);
    constraintsByIdOrCategory.set(constraint.category, constraint);
  }

  const violationLines: string[] = [];

  for (const finding of params.findings) {
    const matchedConstraint =
      constraintsByIdOrCategory.get(finding.finding_id) ??
      constraintsByIdOrCategory.get(finding.category);

    let guidance: string;
    if (matchedConstraint) {
      const ruleDescription = matchedConstraint.rule;
      const rationale = matchedConstraint.rationale ? ` (${matchedConstraint.rationale})` : "";
      guidance = `Constraint "${matchedConstraint.constraint_id}" requires: ${ruleDescription}${rationale}`;
    } else {
      guidance = `Address the issue identified by the verifier`;
    }

    violationLines.push(`- [${finding.severity}] ${finding.message}: ${guidance}`);
  }

  if (violationLines.length === 0) {
    return null;
  }

  const evidenceRequirements = config.planner.evidence_requirements;
  const requirementsText =
    evidenceRequirements.length > 0
      ? evidenceRequirements.join(", ")
      : "grounded, evidence-backed responses";

  return `Your output needs revision:\n${violationLines.join("\n")}\n\nDomain requirements: ${requirementsText}`;
}

export function getRepairAttemptLimit(runId: string): number {
  const context = getNicheRunTraceContext(runId);
  if (!context) {
    return DEFAULT_MAX_REPAIR_ATTEMPTS;
  }
  return context.actionPolicy.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
}
