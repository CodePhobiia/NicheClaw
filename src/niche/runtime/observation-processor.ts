import { getCompiledDomainConfig } from "./run-trace-capture.js";

export type ObservationAnnotation = {
  source_id: string | null;
  matched_signals: string[];
  detected_failures: Array<{ failure_id: string; severity: string }>;
  domain_relevance: "high" | "medium" | "low";
};

export function annotateToolResult(
  runId: string,
  _toolName: string,
  resultSummary: string,
): ObservationAnnotation {
  const config = getCompiledDomainConfig(runId);
  if (!config) {
    return {
      source_id: null,
      matched_signals: [],
      detected_failures: [],
      domain_relevance: "low",
    };
  }

  const lowerSummary = resultSummary.toLowerCase();

  // Match against signal patterns by source_id
  const matchedSignals: string[] = [];
  let sourceId: string | null = null;
  for (const pattern of config.observation.signal_patterns) {
    if (lowerSummary.includes(pattern.source_id.toLowerCase())) {
      matchedSignals.push(pattern.extraction_hint);
      sourceId = pattern.source_id;
    }
  }

  // Detect failure indicators by detection_hints
  const detectedFailures: Array<{ failure_id: string; severity: string }> = [];
  for (const indicator of config.observation.failure_indicators) {
    for (const hint of indicator.detection_hints) {
      if (lowerSummary.includes(hint.toLowerCase())) {
        detectedFailures.push({
          failure_id: indicator.failure_id,
          severity: indicator.severity,
        });
        break;
      }
    }
  }

  const domain_relevance: "high" | "medium" | "low" =
    matchedSignals.length > 0 ? "high" : detectedFailures.length > 0 ? "medium" : "low";

  return {
    source_id: sourceId,
    matched_signals: matchedSignals,
    detected_failures: detectedFailures,
    domain_relevance,
  };
}
