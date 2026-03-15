/**
 * Planner Injection — Domain-Aware System Prompt Builder
 *
 * Builds a markdown-formatted prompt block from the compiled domain
 * configuration so the planner sees domain identity, constraints,
 * terminology, failure modes, evidence requirements, and exemplars.
 */

import type { CompiledDomainConfig } from "../domain/compiled-config.js";
import { getCompiledDomainConfig } from "./run-trace-capture.js";

/**
 * Build a niche planner prompt block for the given run.
 * Returns null when no niche run is active for this run ID.
 */
export function buildNichePlannerPromptBlock(runId: string): string | null {
  const config = getCompiledDomainConfig(runId);
  if (!config) return null;
  return formatPlannerBlock(config);
}

/**
 * Format a compiled domain config into a markdown prompt block
 * with sections for each directive category.
 */
export function formatPlannerBlock(config: CompiledDomainConfig): string {
  const sections: string[] = [];

  // Domain identity — always present
  sections.push(`## Domain Specialization\n${config.planner.domain_identity}`);

  // Reasoning constraints
  if (config.planner.reasoning_constraints.length > 0) {
    sections.push(
      `## Domain Constraints\n${config.planner.reasoning_constraints.map((c) => `- ${c}`).join("\n")}`,
    );
  }

  // Terminology guidance
  if (config.planner.terminology_guidance.length > 0) {
    sections.push(
      `## Domain Terminology\n${config.planner.terminology_guidance.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  // Task decomposition hints
  if (config.planner.task_decomposition_hints.length > 0) {
    sections.push(
      `## Task Families\n${config.planner.task_decomposition_hints.map((h) => `- ${h}`).join("\n")}`,
    );
  }

  // Failure awareness
  if (config.planner.failure_awareness.length > 0) {
    sections.push(
      `## Known Failure Modes\n${config.planner.failure_awareness.map((f) => `- ${f}`).join("\n")}`,
    );
  }

  // Evidence requirements
  if (config.planner.evidence_requirements.length > 0) {
    sections.push(
      `## Output Requirements\n${config.planner.evidence_requirements.map((r) => `- ${r}`).join("\n")}`,
    );
  }

  // Approved evidence sources
  if (config.retrieval.approved_source_ids.length > 0) {
    const sourceLines = config.retrieval.approved_source_ids.map((id) => {
      const desc = config.retrieval.source_descriptions[id] ?? id;
      return `- ${desc} (${id})`;
    });
    sections.push(`## Approved Evidence Sources\n${sourceLines.join("\n")}`);
  }

  // Few-shot exemplars (capped at 3 to keep prompt size manageable)
  if (config.exemplars.length > 0) {
    const exemplarLines = config.exemplars
      .slice(0, 3)
      .map(
        (e) =>
          `### Example: ${e.task_family_id}\nPrompt: ${e.prompt}\nPass conditions: ${e.pass_conditions.join(", ")}`,
      );
    sections.push(`## Domain Examples\n${exemplarLines.join("\n\n")}`);
  }

  return sections.join("\n\n");
}
