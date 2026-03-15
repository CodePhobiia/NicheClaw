import type { EvidenceBundleRef, SourceAccessManifest } from "../schema/index.js";
import type { VerifierFinding } from "./pack.js";

export type GroundingCheckInput = {
  candidateOutput: string;
  evidenceBundleRefs: EvidenceBundleRef[];
  sourceAccessManifest: SourceAccessManifest;
  maxAllowedUngroundedClaims: number;
  requireEvidenceBundles: boolean;
};

export type GroundingCheckResult = {
  findings: VerifierFinding[];
  supported_claim_count: number;
  unsupported_claim_count: number;
  evidence_support_ratio: number;
  referenced_source_ids: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "into",
  "not",
  "that",
  "the",
  "their",
  "this",
  "with",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function splitClaims(value: string): string[] {
  return value
    .split(/[\r\n.!?]+/u)
    .map((claim) => claim.trim())
    .filter((claim) => tokenize(claim).length > 0);
}

function isClaimSupported(claim: string, evidenceTexts: string[]): boolean {
  const normalizedClaim = normalizeText(claim);
  const claimTokens = tokenize(claim);
  if (claimTokens.length === 0) {
    return true;
  }

  const requiredOverlap = Math.min(2, Math.max(1, Math.ceil(claimTokens.length / 3)));
  for (const evidenceText of evidenceTexts) {
    const normalizedEvidence = normalizeText(evidenceText);
    if (normalizedClaim.length >= 16 && normalizedEvidence.includes(normalizedClaim)) {
      return true;
    }
    const evidenceTokens = new Set(tokenize(evidenceText));
    const overlap = claimTokens.filter((token) => evidenceTokens.has(token)).length;
    if (overlap >= requiredOverlap) {
      return true;
    }
  }

  return false;
}

export function evaluateEvidenceGrounding(params: GroundingCheckInput): GroundingCheckResult {
  const findings: VerifierFinding[] = [];
  const allowedSourceIds = new Set([
    ...params.sourceAccessManifest.allowed_retrieval_indices,
    ...params.sourceAccessManifest.allowed_live_sources,
  ]);
  const disallowedSourceIds = new Set(params.sourceAccessManifest.disallowed_sources);
  const evidenceTexts = params.evidenceBundleRefs.flatMap((bundle) => bundle.delivered_evidence);
  const referencedSourceIds = params.evidenceBundleRefs.flatMap((bundle) =>
    bundle.source_refs.map((sourceRef) => sourceRef.source_id),
  );

  if (params.requireEvidenceBundles && params.evidenceBundleRefs.length === 0) {
    findings.push({
      finding_id: "missing_evidence",
      category: "grounding",
      severity: "high",
      blocking: true,
      message: "No evidence bundles were provided for verifier grounding.",
      evidence_source_ids: [],
      remediation: "Attach the retrieved evidence bundle before final delivery.",
    });
  }

  for (const sourceId of [...new Set(referencedSourceIds)].toSorted((left, right) =>
    left.localeCompare(right),
  )) {
    if (disallowedSourceIds.has(sourceId)) {
      findings.push({
        finding_id: `disallowed_source_${sourceId}`,
        category: "grounding",
        severity: "critical",
        blocking: true,
        message: `Evidence bundle references disallowed source "${sourceId}".`,
        evidence_source_ids: [sourceId],
        remediation: "Remove disallowed evidence from the final response path.",
      });
      continue;
    }

    if (allowedSourceIds.size > 0 && !allowedSourceIds.has(sourceId)) {
      findings.push({
        finding_id: `undeclared_source_${sourceId}`,
        category: "grounding",
        severity: "high",
        blocking: true,
        message: `Evidence source "${sourceId}" is not declared in the source-access manifest.`,
        evidence_source_ids: [sourceId],
        remediation: "Re-run retrieval with only declared sources or update source access.",
      });
    }
  }

  const claims = splitClaims(params.candidateOutput);
  const supportedClaimCount = claims.filter((claim) =>
    isClaimSupported(claim, evidenceTexts),
  ).length;
  const unsupportedClaimCount = claims.length - supportedClaimCount;
  const evidenceSupportRatio = claims.length === 0 ? 1 : supportedClaimCount / claims.length;

  if (unsupportedClaimCount > params.maxAllowedUngroundedClaims) {
    findings.push({
      finding_id: "ungrounded_claims",
      category: "grounding",
      severity: "high",
      blocking: true,
      message: `The output contains ${unsupportedClaimCount} ungrounded claims, above the allowed limit of ${params.maxAllowedUngroundedClaims}.`,
      evidence_source_ids: [...new Set(referencedSourceIds)].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      remediation: "Repair the answer to align every substantive claim with retrieved evidence.",
    });
  } else if (unsupportedClaimCount > 0) {
    findings.push({
      finding_id: "partial_grounding_gap",
      category: "grounding",
      severity: "moderate",
      blocking: false,
      message: `The output contains ${unsupportedClaimCount} partially grounded claims that should be repaired before promotion-sensitive delivery.`,
      evidence_source_ids: [...new Set(referencedSourceIds)].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      remediation: "Tighten the answer so every claim maps back to the delivered evidence.",
    });
  }

  return {
    findings,
    supported_claim_count: supportedClaimCount,
    unsupported_claim_count: unsupportedClaimCount,
    evidence_support_ratio: evidenceSupportRatio,
    referenced_source_ids: [...new Set(referencedSourceIds)].toSorted((left, right) =>
      left.localeCompare(right),
    ),
  };
}
