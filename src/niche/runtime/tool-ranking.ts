import type { CompiledDomainConfig, ToolDirective } from "../domain/compiled-config.js";
import { getCompiledDomainConfig } from "./run-trace-capture.js";

export type ToolRankingResult = {
  tool_name: string;
  domain_relevance_score: number;
  domain_intent: string;
  preferred_arguments: Record<string, string>;
};

/** Default score assigned to tools without a domain directive. */
const NON_DOMAIN_TOOL_SCORE = 0.1;

/**
 * Rank available tools by domain relevance for a given niche run.
 *
 * Tools that have a matching ToolDirective in the compiled domain config
 * receive that directive's relevance score (1.0 by default). Tools without
 * a directive receive a baseline score of 0.1. Results are sorted descending
 * by domain_relevance_score.
 */
export function rankToolsForNicheRun(
  runId: string,
  availableToolNames: string[],
): ToolRankingResult[] {
  const config = getCompiledDomainConfig(runId);
  if (!config) {
    return [];
  }

  const directivesByTool = buildDirectiveLookup(config);

  const ranked = availableToolNames.map((toolName): ToolRankingResult => {
    const directive = directivesByTool.get(toolName);
    if (directive) {
      return {
        tool_name: toolName,
        domain_relevance_score: directive.domain_relevance_score,
        domain_intent: directive.domain_intent,
        preferred_arguments: { ...directive.preferred_arguments },
      };
    }
    return {
      tool_name: toolName,
      domain_relevance_score: NON_DOMAIN_TOOL_SCORE,
      domain_intent: "",
      preferred_arguments: {},
    };
  });

  // Sort descending by score; stable sort preserves insertion order for ties.
  ranked.sort((a, b) => b.domain_relevance_score - a.domain_relevance_score);

  return ranked;
}

/**
 * Retrieve the preferred argument defaults for a specific tool in a niche run.
 *
 * Returns an empty object when no compiled config exists or the tool has no
 * matching directive.
 */
export function getDomainArgumentDefaults(runId: string, toolName: string): Record<string, string> {
  const config = getCompiledDomainConfig(runId);
  if (!config) {
    return {};
  }

  const directive = config.tools.find((t) => t.tool_name === toolName);
  if (!directive) {
    return {};
  }

  return { ...directive.preferred_arguments };
}

/** Build a Map from tool_name to ToolDirective for O(1) lookups. */
function buildDirectiveLookup(config: CompiledDomainConfig): Map<string, ToolDirective> {
  const map = new Map<string, ToolDirective>();
  for (const directive of config.tools) {
    map.set(directive.tool_name, directive);
  }
  return map;
}
