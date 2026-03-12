import type { DomainConstraint, DomainPack } from "../schema/index.js";
import type { VerifierFinding, VerifierReleaseGuardrails } from "./pack.js";

export type ConstraintCheckInput = {
  candidateOutput: string;
  outputFormat: "text" | "json" | "markdown";
  domainPack: DomainPack;
  releaseGuardrails?: VerifierReleaseGuardrails;
  latencyAddedMs: number;
  costAdded: number;
};

export type ConstraintCheckResult = {
  findings: VerifierFinding[];
};

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function isMarkdown(value: string): boolean {
  return /(^#|\n#|\*\*|`{3}|^- )/mu.test(value);
}

function isJson(value: string): boolean {
  try {
    const parsed = JSON.parse(value);
    return parsed !== null;
  } catch {
    return false;
  }
}

function toFinding(params: {
  id: string;
  category: VerifierFinding["category"];
  severity: DomainConstraint["severity"] | "warning";
  blocking?: boolean;
  message: string;
  remediation?: string;
}): VerifierFinding {
  return {
    finding_id: params.id,
    category: params.category,
    severity: params.severity === "warning" ? "warning" : params.severity,
    blocking:
      params.blocking ??
      (params.severity === "high" || params.severity === "critical"),
    message: params.message,
    evidence_source_ids: [],
    remediation: params.remediation,
  };
}

function evaluateConstraintRule(
  constraint: DomainConstraint,
  candidateOutput: string,
  outputFormat: ConstraintCheckInput["outputFormat"],
): VerifierFinding | null {
  const normalizedOutput = normalizeText(candidateOutput);
  const rule = constraint.rule.trim();
  const lowerRule = rule.toLowerCase();

  if (lowerRule.startsWith("must_include:")) {
    const required = rule.slice("must_include:".length).trim();
    if (!normalizeText(required) || normalizedOutput.includes(normalizeText(required))) {
      return null;
    }
    return toFinding({
      id: constraint.constraint_id,
      category: "constraint",
      severity: constraint.severity,
      message: `Output must include "${required}" to satisfy constraint ${constraint.constraint_id}.`,
      remediation: "Repair the final answer to include the required content.",
    });
  }

  if (lowerRule.startsWith("must_not_include:") || lowerRule.startsWith("forbid:")) {
    const prefix = lowerRule.startsWith("must_not_include:")
      ? "must_not_include:"
      : "forbid:";
    const forbidden = rule.slice(prefix.length).trim();
    if (!normalizeText(forbidden) || !normalizedOutput.includes(normalizeText(forbidden))) {
      return null;
    }
    return toFinding({
      id: constraint.constraint_id,
      category: "constraint",
      severity: constraint.severity,
      message: `Output includes forbidden content "${forbidden}" from constraint ${constraint.constraint_id}.`,
      remediation: "Remove the forbidden content before delivery.",
    });
  }

  if (lowerRule.startsWith("format:")) {
    const expectedFormat = rule.slice("format:".length).trim().toLowerCase();
    if (expectedFormat === outputFormat) {
      return null;
    }
    return toFinding({
      id: constraint.constraint_id,
      category: "format",
      severity: constraint.severity,
      message: `Output format "${outputFormat}" does not satisfy required format "${expectedFormat}".`,
      remediation: "Regenerate the answer in the required format.",
    });
  }

  if (lowerRule.startsWith("max_length:")) {
    const maxLength = Number.parseInt(rule.slice("max_length:".length).trim(), 10);
    if (Number.isNaN(maxLength) || candidateOutput.length <= maxLength) {
      return null;
    }
    return toFinding({
      id: constraint.constraint_id,
      category: "constraint",
      severity: constraint.severity,
      message: `Output length ${candidateOutput.length} exceeds max_length ${maxLength}.`,
      remediation: "Shorten the answer before delivery.",
    });
  }

  return null;
}

function evaluateOutputRequirement(
  requirement: string,
  candidateOutput: string,
  outputFormat: ConstraintCheckInput["outputFormat"],
): VerifierFinding | null {
  const normalizedRequirement = requirement.trim().toLowerCase();
  if (normalizedRequirement === "grounded_response") {
    return null;
  }

  if (normalizedRequirement === "non_empty_output" && candidateOutput.trim().length === 0) {
    return toFinding({
      id: "non_empty_output",
      category: "format",
      severity: "high",
      message: "Verifier requires a non-empty final output.",
      remediation: "Repair the answer to include a substantive final response.",
    });
  }

  if (normalizedRequirement === "json_output" && !isJson(candidateOutput)) {
    return toFinding({
      id: "json_output",
      category: "format",
      severity: "high",
      message: "Verifier requires JSON output, but the candidate output is not valid JSON.",
      remediation: "Regenerate the answer as valid JSON.",
    });
  }

  if (normalizedRequirement === "markdown_output" && !isMarkdown(candidateOutput)) {
    return toFinding({
      id: "markdown_output",
      category: "format",
      severity: "moderate",
      message: "Verifier requires markdown-style output, but the candidate output does not look like markdown.",
      remediation: "Repair the answer to use markdown formatting.",
    });
  }

  if (normalizedRequirement.startsWith("must_include:")) {
    const required = requirement.slice("must_include:".length).trim();
    if (
      !normalizeText(required) ||
      normalizeText(candidateOutput).includes(normalizeText(required))
    ) {
      return null;
    }
    return toFinding({
      id: `output_requirement_${required.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      category: "constraint",
      severity: "moderate",
      message: `Verifier output requirement is missing required text "${required}".`,
      remediation: "Repair the answer to satisfy the declared output requirement.",
    });
  }

  if (
    normalizedRequirement.startsWith("must_not_include:") ||
    normalizedRequirement.startsWith("forbid:")
  ) {
    const prefix = normalizedRequirement.startsWith("must_not_include:")
      ? "must_not_include:"
      : "forbid:";
    const forbidden = requirement.slice(prefix.length).trim();
    if (
      !normalizeText(forbidden) ||
      !normalizeText(candidateOutput).includes(normalizeText(forbidden))
    ) {
      return null;
    }
    return toFinding({
      id: `output_requirement_forbid_${forbidden.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      category: "constraint",
      severity: "high",
      message: `Verifier output requirement forbids "${forbidden}", but it is present in the output.`,
      remediation: "Remove the forbidden content before delivery.",
    });
  }

  if (
    normalizedRequirement === "text_output" &&
    outputFormat !== "text" &&
    outputFormat !== "markdown"
  ) {
    return toFinding({
      id: "text_output",
      category: "format",
      severity: "moderate",
      message: `Verifier expected text-oriented output but received "${outputFormat}".`,
      remediation: "Repair the answer using text-oriented output.",
    });
  }

  return null;
}

export function evaluateDomainConstraints(
  params: ConstraintCheckInput,
): ConstraintCheckResult {
  const findings: VerifierFinding[] = [];

  for (const constraint of params.domainPack.constraints) {
    const finding = evaluateConstraintRule(
      constraint,
      params.candidateOutput,
      params.outputFormat,
    );
    if (finding) {
      findings.push(finding);
    }
  }

  for (const requirement of params.domainPack.verifier_defaults.output_requirements) {
    const finding = evaluateOutputRequirement(
      requirement,
      params.candidateOutput,
      params.outputFormat,
    );
    if (finding) {
      findings.push(finding);
    }
  }

  if (
    params.releaseGuardrails?.max_latency_added_ms !== undefined &&
    params.latencyAddedMs > params.releaseGuardrails.max_latency_added_ms
  ) {
    findings.push(
      toFinding({
        id: "release_policy_latency_budget",
        category: "release_policy",
        severity: "high",
        message: `Verifier latency budget exceeded: ${params.latencyAddedMs}ms > ${params.releaseGuardrails.max_latency_added_ms}ms.`,
        remediation: "Do not promote or deliver this output until the latency regression is repaired.",
      }),
    );
  }

  if (
    params.releaseGuardrails?.max_cost_added !== undefined &&
    params.costAdded > params.releaseGuardrails.max_cost_added
  ) {
    findings.push(
      toFinding({
        id: "release_policy_cost_budget",
        category: "release_policy",
        severity: "high",
        message: `Verifier cost budget exceeded: ${params.costAdded} > ${params.releaseGuardrails.max_cost_added}.`,
        remediation: "Repair the output path before promotion-sensitive delivery.",
      }),
    );
  }

  return {
    findings: findings.toSorted((left, right) => left.finding_id.localeCompare(right.finding_id)),
  };
}
