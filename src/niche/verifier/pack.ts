import type {
  DomainPack,
  EvidenceBundleRef,
  SourceAccessManifest,
  VerifierDecisionRecord,
  VerifierOutcome,
} from "../schema/index.js";
import { evaluateDomainConstraints } from "./constraints.js";
import { evaluateEvidenceGrounding } from "./grounding.js";

export const VERIFIER_FINDING_SEVERITIES = [
  "info",
  "warning",
  "moderate",
  "high",
  "critical",
] as const;

export const VERIFIER_FINDING_CATEGORIES = [
  "grounding",
  "constraint",
  "format",
  "release_policy",
  "confidence",
] as const;

export type VerifierFindingSeverity = (typeof VERIFIER_FINDING_SEVERITIES)[number];
export type VerifierFindingCategory = (typeof VERIFIER_FINDING_CATEGORIES)[number];

export type VerifierFinding = {
  finding_id: string;
  category: VerifierFindingCategory;
  severity: VerifierFindingSeverity;
  message: string;
  blocking: boolean;
  evidence_source_ids: string[];
  remediation?: string;
};

export type VerifierReleaseGuardrails = {
  max_latency_added_ms?: number;
  max_cost_added?: number;
  veto_on_blocking_findings?: boolean;
  escalate_on_low_confidence?: boolean;
};

export type VerifierPackConfig = {
  verifier_pack_id: string;
  version: string;
  required_checks: string[];
  blocking_failure_ids: string[];
  output_requirements: string[];
  escalation_policy: string;
  min_confidence: number;
  max_allowed_ungrounded_claims: number;
  require_evidence_bundles?: boolean;
  release_guardrails?: VerifierReleaseGuardrails;
};

export type VerifierPackRunInput = {
  run_id: string;
  niche_program_id: string;
  candidate_output: string;
  output_format?: "text" | "json" | "markdown";
  domain_pack: DomainPack;
  source_access_manifest: SourceAccessManifest;
  evidence_bundle_refs: EvidenceBundleRef[];
  checked_at: string;
  model_confidence?: number;
  latency_added_ms?: number;
  cost_added?: number;
};

export type VerifierDecision = {
  decision_id: string;
  verifier_pack_id: string;
  verifier_pack_version: string;
  run_id: string;
  niche_program_id: string;
  outcome: VerifierOutcome;
  rationale: string;
  findings: VerifierFinding[];
  checked_at: string;
  model_confidence?: number;
  evidence_support_ratio: number;
  effective_confidence: number;
  confidence_threshold: number;
  latency_added_ms: number;
  cost_added: number;
};

function severityRank(severity: VerifierFindingSeverity): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "moderate":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
  }
}

function sortFindings(findings: VerifierFinding[]): VerifierFinding[] {
  return [...findings].toSorted((left, right) => {
    const severityDelta = severityRank(right.severity) - severityRank(left.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return left.finding_id.localeCompare(right.finding_id);
  });
}

function normalizeConfidence(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function buildConfidenceFinding(params: {
  effectiveConfidence: number;
  modelConfidence?: number;
  config: VerifierPackConfig;
}): VerifierFinding | null {
  if (params.effectiveConfidence >= params.config.min_confidence) {
    return null;
  }

  const message =
    params.modelConfidence === undefined
      ? `Effective verifier confidence ${params.effectiveConfidence.toFixed(3)} is below the required threshold ${params.config.min_confidence.toFixed(3)}.`
      : `Model confidence ${params.modelConfidence.toFixed(3)} and grounded support produced an effective confidence ${params.effectiveConfidence.toFixed(3)}, below the required threshold ${params.config.min_confidence.toFixed(3)}.`;

  return {
    finding_id: "low_verifier_confidence",
    category: "confidence",
    severity: "moderate",
    blocking: false,
    message,
    evidence_source_ids: [],
    remediation:
      "Request a repair pass or escalate for operator review before user-visible delivery.",
  };
}

function mergeFindings(params: {
  config: VerifierPackConfig;
  findings: VerifierFinding[];
}): VerifierFinding[] {
  return sortFindings(
    params.findings.map((finding) => ({
      ...finding,
      blocking: finding.blocking || params.config.blocking_failure_ids.includes(finding.finding_id),
    })),
  );
}

function resolveOutcome(params: {
  findings: VerifierFinding[];
  config: VerifierPackConfig;
  effectiveConfidence: number;
}): VerifierOutcome {
  const blockingFindings = params.findings.filter((finding) => finding.blocking);
  if (blockingFindings.length > 0) {
    if (params.config.release_guardrails?.veto_on_blocking_findings === false) {
      return "escalated";
    }
    return "vetoed";
  }

  const hasRepairableNonConfidenceFinding = params.findings.some(
    (finding) =>
      finding.category !== "confidence" &&
      (finding.severity === "moderate" ||
        finding.category === "format" ||
        finding.category === "constraint"),
  );

  if (params.effectiveConfidence < params.config.min_confidence) {
    if (params.config.release_guardrails?.escalate_on_low_confidence === false) {
      return "repair_requested";
    }
    return "escalated";
  }

  if (hasRepairableNonConfidenceFinding) {
    return "repair_requested";
  }

  return "approved";
}

function buildRationale(outcome: VerifierOutcome, findings: VerifierFinding[]): string {
  if (findings.length === 0) {
    return "All configured grounding, constraint, format, and confidence checks passed.";
  }

  const topFindings = findings
    .slice(0, 2)
    .map((finding) => finding.message)
    .join(" ");

  switch (outcome) {
    case "vetoed":
      return `Verifier vetoed final delivery. ${topFindings}`;
    case "repair_requested":
      return `Verifier requested repair before final delivery. ${topFindings}`;
    case "escalated":
      return `Verifier escalated the final output for operator review. ${topFindings}`;
    case "approved":
      return `Verifier approved final delivery with no blocking findings. ${topFindings}`;
  }
}

export function runVerifierPack(params: {
  config: VerifierPackConfig;
  input: VerifierPackRunInput;
}): VerifierDecision {
  const normalizedModelConfidence = normalizeConfidence(params.input.model_confidence);
  const grounding = evaluateEvidenceGrounding({
    candidateOutput: params.input.candidate_output,
    evidenceBundleRefs: params.input.evidence_bundle_refs,
    sourceAccessManifest: params.input.source_access_manifest,
    maxAllowedUngroundedClaims: params.config.max_allowed_ungrounded_claims,
    requireEvidenceBundles: params.config.require_evidence_bundles ?? true,
  });
  const constraints = evaluateDomainConstraints({
    candidateOutput: params.input.candidate_output,
    outputFormat: params.input.output_format ?? "text",
    domainPack: params.input.domain_pack,
    releaseGuardrails: params.config.release_guardrails,
    latencyAddedMs: params.input.latency_added_ms ?? 0,
    costAdded: params.input.cost_added ?? 0,
  });

  const effectiveConfidence = Math.min(
    normalizedModelConfidence ?? 1,
    grounding.evidence_support_ratio,
  );
  const confidenceFinding = buildConfidenceFinding({
    effectiveConfidence,
    modelConfidence: normalizedModelConfidence,
    config: params.config,
  });

  const findings = mergeFindings({
    config: params.config,
    findings: [
      ...grounding.findings,
      ...constraints.findings,
      ...(confidenceFinding ? [confidenceFinding] : []),
    ],
  });
  const outcome = resolveOutcome({
    findings,
    config: params.config,
    effectiveConfidence,
  });

  return {
    decision_id: `${params.input.run_id}-${params.config.verifier_pack_id}-decision`,
    verifier_pack_id: params.config.verifier_pack_id,
    verifier_pack_version: params.config.version,
    run_id: params.input.run_id,
    niche_program_id: params.input.niche_program_id,
    outcome,
    rationale: buildRationale(outcome, findings),
    findings,
    checked_at: params.input.checked_at,
    model_confidence: normalizedModelConfidence,
    evidence_support_ratio: grounding.evidence_support_ratio,
    effective_confidence: effectiveConfidence,
    confidence_threshold: params.config.min_confidence,
    latency_added_ms: params.input.latency_added_ms ?? 0,
    cost_added: params.input.cost_added ?? 0,
  };
}

export function toRunTraceVerifierDecisionRecord(
  decision: VerifierDecision,
): VerifierDecisionRecord {
  return {
    decision_id: decision.decision_id,
    outcome: decision.outcome,
    rationale: decision.rationale,
    findings: decision.findings.map((finding) => ({
      finding_id: finding.finding_id,
      severity: finding.severity,
      message: finding.message,
    })),
  };
}

export function createVerifierPackConfig(params: {
  verifierPackId: string;
  version: string;
  domainPack: DomainPack;
  minConfidence?: number;
  maxAllowedUngroundedClaims?: number;
  releaseGuardrails?: VerifierReleaseGuardrails;
}): VerifierPackConfig {
  return {
    verifier_pack_id: params.verifierPackId,
    version: params.version,
    required_checks: [...params.domainPack.verifier_defaults.required_checks],
    blocking_failure_ids: [...params.domainPack.verifier_defaults.blocking_failure_ids],
    output_requirements: [...params.domainPack.verifier_defaults.output_requirements],
    escalation_policy: params.domainPack.verifier_defaults.escalation_policy,
    min_confidence: params.minConfidence ?? 0.6,
    max_allowed_ungrounded_claims: params.maxAllowedUngroundedClaims ?? 0,
    require_evidence_bundles: true,
    release_guardrails: params.releaseGuardrails,
  };
}
