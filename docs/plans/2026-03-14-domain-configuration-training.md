# NicheClaw Domain Configuration Training Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform NicheClaw from a governance shell into a real agent training system where compilation produces operating configuration that changes how every stage of the agent's execution pipeline works — making the specialized agent verifiably better than a general one, not just restricted and checked.

**Architecture:** A Domain Configuration Compiler takes the DomainPack and produces a `CompiledDomainConfig` — a structured object with directives for each pipeline stage: planner instructions, tool rankings, argument defaults, observation extractors, retrieval bindings, few-shot exemplars, and constraint enforcement rules. This compiled config is carried in the PreparedNicheRunSeed and registered in the run trace context. Each pipeline stage reads its portion from the context and transforms its behavior accordingly. Binding uses existing plugin hooks (`before_prompt_build`, `before_tool_call`, `after_tool_call`) where available, and direct function calls at seams that lack hooks.

**Tech Stack:** TypeScript ESM, existing OpenClaw plugin hook system, existing pi-agent execution pipeline, TypeBox schemas for compiled config validation.

**Prerequisite reading:**

- `src/niche/runtime/run-trace-capture.ts` — trace context registration and data access
- `src/plugins/hooks.ts` — hook execution machinery
- `src/plugins/types.ts` — hook type definitions (especially `before_prompt_build`, `before_tool_call`, `after_tool_call`)
- `src/agents/pi-tools.ts` — tool pipeline
- `src/agents/pi-tools.policy.ts` — tool policy resolution
- `src/niche/runtime/verifier-gate.ts` — verifier binding pattern
- `src/niche/schema/domain-pack.ts` — DomainPack schema (source of truth for domain knowledge)

---

### Task 1: Define CompiledDomainConfig Schema

**Files:**

- Create: `src/niche/domain/compiled-config.ts`
- Test: `test/niche/domain/compiled-config.test.ts`

**What this does:** Defines the typed output of domain compilation — the operating configuration that each pipeline stage consumes. This is the contract between compilation and runtime.

**Step 1: Write the schema and compiler stub**

```typescript
// src/niche/domain/compiled-config.ts
import type { DomainPack } from "../schema/index.js";

export type PlannerDirectives = {
  domain_identity: string; // "You are a {niche} specialist."
  reasoning_constraints: string[]; // From domain constraints
  terminology_guidance: string[]; // From terminology map
  task_decomposition_hints: string[]; // From task taxonomy
  failure_awareness: string[]; // From failure taxonomy
  evidence_requirements: string[]; // From verifier defaults
};

export type ToolDirective = {
  tool_name: string;
  domain_relevance_score: number; // 0-1, from tool contracts
  preferred_arguments: Record<string, string>; // domain-specific defaults
  domain_intent: string; // from tool contract intent_summary
  failure_modes: string[]; // from tool contract failure_modes
  required_arguments: string[]; // from tool contract required_arguments
};

export type ObservationDirective = {
  signal_patterns: Array<{
    source_id: string;
    pattern_description: string;
    extraction_hint: string;
  }>;
  failure_indicators: Array<{
    failure_id: string;
    detection_hints: string[];
    severity: string;
  }>;
};

export type RetrievalDirective = {
  approved_source_ids: string[];
  source_descriptions: Record<string, string>;
  freshness_expectations: Record<string, string>;
};

export type ExemplarDirective = {
  seed_id: string;
  task_family_id: string;
  prompt: string;
  pass_conditions: string[];
  hard_fail_conditions: string[];
};

export type ConstraintEnforcementDirective = {
  constraint_id: string;
  category: string;
  rule: string;
  severity: string;
  rationale?: string;
};

export type CompiledDomainConfig = {
  niche_program_id: string;
  domain_pack_id: string;
  version: string;
  compiled_at: string;
  planner: PlannerDirectives;
  tools: ToolDirective[];
  observation: ObservationDirective;
  retrieval: RetrievalDirective;
  exemplars: ExemplarDirective[];
  constraints: ConstraintEnforcementDirective[];
};

export function compileDomainConfig(domainPack: DomainPack): CompiledDomainConfig {
  const now = new Date().toISOString();

  const planner: PlannerDirectives = {
    domain_identity: `You are a specialist in ${domainPack.niche_program_id}. Your responses must be grounded in approved domain evidence.`,
    reasoning_constraints: domainPack.constraints.map(
      (c) => `[${c.severity}] ${c.rule}${c.rationale ? ` — ${c.rationale}` : ""}`,
    ),
    terminology_guidance: Object.entries(domainPack.terminology_map).map(
      ([term, entry]) =>
        `Use "${entry.canonical_term}" (not ${entry.synonyms?.join(", ") ?? "N/A"}): ${entry.definition ?? ""}`,
    ),
    task_decomposition_hints: domainPack.task_taxonomy.map(
      (t) => `Task family "${t.label}": requires [${t.required_capabilities.join(", ")}]`,
    ),
    failure_awareness: domainPack.failure_taxonomy.map(
      (f) =>
        `Avoid "${f.label}" (${f.severity}): ${f.description}. Detection hints: ${f.detection_hints.join(", ")}`,
    ),
    evidence_requirements: domainPack.verifier_defaults.output_requirements,
  };

  const tools: ToolDirective[] = domainPack.tool_contracts.map((tc) => ({
    tool_name: tc.tool_name,
    domain_relevance_score: 1.0,
    preferred_arguments: {},
    domain_intent: tc.intent_summary,
    failure_modes: tc.failure_modes,
    required_arguments: tc.required_arguments,
  }));

  const observation: ObservationDirective = {
    signal_patterns: domainPack.evidence_source_registry.map((src) => ({
      source_id: src.source_id,
      pattern_description: src.title,
      extraction_hint: `Access via ${src.access_pattern}. Trust: ${src.trust_notes ?? "standard"}.`,
    })),
    failure_indicators: domainPack.failure_taxonomy.map((f) => ({
      failure_id: f.failure_id,
      detection_hints: f.detection_hints,
      severity: f.severity,
    })),
  };

  const retrieval: RetrievalDirective = {
    approved_source_ids: domainPack.evidence_source_registry.map((src) => src.source_id),
    source_descriptions: Object.fromEntries(
      domainPack.evidence_source_registry.map((src) => [src.source_id, src.title]),
    ),
    freshness_expectations: Object.fromEntries(
      domainPack.evidence_source_registry
        .filter((src) => src.freshness_expectation)
        .map((src) => [src.source_id, src.freshness_expectation!]),
    ),
  };

  const exemplars: ExemplarDirective[] = domainPack.benchmark_seed_specs.map((seed) => ({
    seed_id: seed.seed_id,
    task_family_id: seed.task_family_id,
    prompt: seed.prompt,
    pass_conditions: seed.pass_conditions,
    hard_fail_conditions: seed.hard_fail_conditions,
  }));

  const constraints: ConstraintEnforcementDirective[] = domainPack.constraints.map((c) => ({
    constraint_id: c.constraint_id,
    category: c.category,
    rule: c.rule,
    severity: c.severity,
    rationale: c.rationale,
  }));

  return {
    niche_program_id: domainPack.niche_program_id,
    domain_pack_id: domainPack.domain_pack_id,
    version: domainPack.version,
    compiled_at: now,
    planner,
    tools,
    observation,
    retrieval,
    exemplars,
    constraints,
  };
}
```

**Step 2: Write tests**

Test that `compileDomainConfig` produces valid directives from a domain pack fixture. Test that planner directives include constraint text. Test that tool directives match tool contracts. Test that exemplars come from benchmark seed specs.

**Step 3: Run tests**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/domain/compiled-config.test.ts`
Expected: PASS

**Step 4: Export from domain index**

Add to `src/niche/domain/index.ts`:

```typescript
export {
  compileDomainConfig,
  type CompiledDomainConfig,
  type PlannerDirectives,
} from "./compiled-config.js";
```

**Step 5: Commit**

```
feat(niche): add CompiledDomainConfig schema and compiler
```

---

### Task 2: Carry Compiled Config in Prepared Seed and Trace Context

**Files:**

- Modify: `src/niche/runtime/run-trace-capture.ts`
- Modify: `src/niche/runtime/prepare-run-seed.ts`
- Test: `test/niche/domain/compiled-config-binding.test.ts`

**What this does:** When a niche run starts, the domain pack is compiled into a `CompiledDomainConfig` and registered in the run trace context so all downstream seams can access it.

**Step 1: Extend `NicheRunTraceContext` to carry compiled config**

In `src/niche/runtime/run-trace-capture.ts`, add `compiledDomainConfig?: CompiledDomainConfig` to the `NicheRunTraceContext` type.

In `registerPreparedNicheRunTraceContext`, after the existing seed registration logic, add:

```typescript
import { compileDomainConfig } from "../domain/compiled-config.js";

// Inside registerPreparedNicheRunTraceContext, after existing logic:
const compiledConfig = compileDomainConfig(params.seed.domain_pack);
// Store on the context
context.compiledDomainConfig = compiledConfig;
```

**Step 2: Add accessor function**

```typescript
export function getCompiledDomainConfig(runId: string): CompiledDomainConfig | undefined {
  return nicheRunTraceContexts.get(runId)?.compiledDomainConfig;
}
```

**Step 3: Write test**

Test that after `registerPreparedNicheRunTraceContext`, `getCompiledDomainConfig(runId)` returns a valid compiled config derived from the seed's domain pack.

**Step 4: Run tests**

Run: `npx vitest run --config vitest.niche.config.ts`
Expected: All passing

**Step 5: Commit**

```
feat(niche): carry CompiledDomainConfig in run trace context
```

---

### Task 3: Planner Stage — Domain-Aware System Prompt Injection

**Files:**

- Create: `src/niche/runtime/planner-injection.ts`
- Modify: `src/plugins/hooks.ts` (register niche prompt builder)
- Test: `test/niche/runtime/planner-injection.test.ts`

**What this does:** When a niche run is active, the planner's system prompt is augmented with domain identity, reasoning constraints, terminology guidance, task decomposition hints, failure awareness, evidence requirements, and few-shot exemplars. This is the single most impactful change — it makes the model actually know the domain.

**Step 1: Create the planner injection module**

```typescript
// src/niche/runtime/planner-injection.ts
import { getCompiledDomainConfig } from "./run-trace-capture.js";
import type { CompiledDomainConfig } from "../domain/compiled-config.js";

export function buildNichePlannerPromptBlock(runId: string): string | null {
  const config = getCompiledDomainConfig(runId);
  if (!config) return null;
  return formatPlannerBlock(config);
}

export function formatPlannerBlock(config: CompiledDomainConfig): string {
  const sections: string[] = [];

  // Domain identity
  sections.push(`## Domain Specialization\n${config.planner.domain_identity}`);

  // Reasoning constraints
  if (config.planner.reasoning_constraints.length > 0) {
    sections.push(
      `## Domain Constraints\n${config.planner.reasoning_constraints.map((c) => `- ${c}`).join("\n")}`,
    );
  }

  // Terminology
  if (config.planner.terminology_guidance.length > 0) {
    sections.push(
      `## Domain Terminology\n${config.planner.terminology_guidance.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  // Task decomposition
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

  // Approved sources
  if (config.retrieval.approved_source_ids.length > 0) {
    const sourceLines = config.retrieval.approved_source_ids.map((id) => {
      const desc = config.retrieval.source_descriptions[id] ?? id;
      return `- ${desc} (${id})`;
    });
    sections.push(`## Approved Evidence Sources\n${sourceLines.join("\n")}`);
  }

  // Few-shot exemplars
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
```

**Step 2: Wire into `before_prompt_build` hook**

In `src/niche/runtime/planner-injection.ts`, add a registration function:

```typescript
export function registerNichePlannerHook(): void {
  // This is called during niche run setup to register the prompt injection hook
}
```

The actual wiring depends on how `before_prompt_build` is consumed. Based on the seam map, the hook receives a `PluginHookBeforePromptBuildEvent` and can return modified system prompt content. The implementation should:

1. Check if a niche run is active for the current run ID
2. If so, append the planner block to the system prompt
3. If not, pass through unmodified

**Step 3: Write tests**

Test that `formatPlannerBlock` produces expected markdown from a compiled config. Test that it includes domain identity, constraints, terminology, failure modes, evidence requirements, and exemplars. Test that `buildNichePlannerPromptBlock` returns null when no niche run is active.

**Step 4: Run tests**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/runtime/planner-injection.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat(niche): add domain-aware planner prompt injection
```

---

### Task 4: Action Stage — Tool Ranking and Domain-Aware Argument Defaults

**Files:**

- Create: `src/niche/runtime/tool-ranking.ts`
- Modify: `src/agents/pi-tools.policy.ts` (extend niche policy to include ranking)
- Test: `test/niche/runtime/tool-ranking.test.ts`

**What this does:** When a niche run is active, tools are ranked by domain relevance (not just allowed/blocked), and domain-specific argument defaults are injected via the `before_tool_call` hook.

**Step 1: Create the tool ranking module**

```typescript
// src/niche/runtime/tool-ranking.ts
import { getCompiledDomainConfig } from "./run-trace-capture.js";
import type { ToolDirective } from "../domain/compiled-config.js";

export type ToolRankingResult = {
  tool_name: string;
  domain_relevance_score: number;
  domain_intent: string;
  preferred_arguments: Record<string, string>;
};

export function rankToolsForNicheRun(
  runId: string,
  availableToolNames: string[],
): ToolRankingResult[] {
  const config = getCompiledDomainConfig(runId);
  if (!config) return [];

  const directiveMap = new Map(config.tools.map((t) => [t.tool_name, t]));

  return availableToolNames
    .map((name) => {
      const directive = directiveMap.get(name);
      return {
        tool_name: name,
        domain_relevance_score: directive?.domain_relevance_score ?? 0.1,
        domain_intent: directive?.domain_intent ?? "",
        preferred_arguments: directive?.preferred_arguments ?? {},
      };
    })
    .toSorted((a, b) => b.domain_relevance_score - a.domain_relevance_score);
}

export function getDomainArgumentDefaults(runId: string, toolName: string): Record<string, string> {
  const config = getCompiledDomainConfig(runId);
  if (!config) return {};
  const directive = config.tools.find((t) => t.tool_name === toolName);
  return directive?.preferred_arguments ?? {};
}
```

**Step 2: Extend niche tool policy to carry ranking metadata**

In `src/agents/pi-tools.policy.ts`, extend `resolveNicheToolPolicy` to include domain relevance ordering. The policy should sort the allowed tools by domain relevance score so the agent sees domain-relevant tools first.

**Step 3: Wire argument defaults into `before_tool_call`**

The `before_tool_call` hook receives tool call parameters and can modify them. When a niche run is active, inject domain-specific argument defaults for arguments the model didn't explicitly set.

**Step 4: Write tests**

Test that `rankToolsForNicheRun` sorts tools by domain relevance. Test that tools without directives get a low default score. Test that `getDomainArgumentDefaults` returns defaults from the compiled config.

**Step 5: Run tests and commit**

```
feat(niche): add domain-aware tool ranking and argument defaults
```

---

### Task 5: Observation Stage — Domain-Aware Signal Extraction

**Files:**

- Create: `src/niche/runtime/observation-processor.ts`
- Test: `test/niche/runtime/observation-processor.test.ts`

**What this does:** After tool execution, domain-specific signal extraction processes results to identify domain-relevant patterns and failure indicators before the next planner turn. This helps the model learn from tool outputs in domain-specific ways.

**Step 1: Create the observation processor**

```typescript
// src/niche/runtime/observation-processor.ts
import { getCompiledDomainConfig } from "./run-trace-capture.js";

export type ObservationAnnotation = {
  source_id: string | null;
  matched_signals: string[];
  detected_failures: Array<{ failure_id: string; severity: string }>;
  domain_relevance: "high" | "medium" | "low";
};

export function annotateToolResult(
  runId: string,
  toolName: string,
  resultSummary: string,
): ObservationAnnotation {
  const config = getCompiledDomainConfig(runId);
  if (!config) {
    return { source_id: null, matched_signals: [], detected_failures: [], domain_relevance: "low" };
  }

  // Match against signal patterns
  const matchedSignals: string[] = [];
  let sourceId: string | null = null;
  for (const pattern of config.observation.signal_patterns) {
    if (resultSummary.toLowerCase().includes(pattern.source_id.toLowerCase())) {
      matchedSignals.push(pattern.extraction_hint);
      sourceId = pattern.source_id;
    }
  }

  // Detect failure indicators
  const detectedFailures: Array<{ failure_id: string; severity: string }> = [];
  for (const indicator of config.observation.failure_indicators) {
    for (const hint of indicator.detection_hints) {
      if (resultSummary.toLowerCase().includes(hint.toLowerCase())) {
        detectedFailures.push({
          failure_id: indicator.failure_id,
          severity: indicator.severity,
        });
        break;
      }
    }
  }

  const domain_relevance =
    matchedSignals.length > 0 ? "high" : detectedFailures.length > 0 ? "medium" : "low";

  return {
    source_id: sourceId,
    matched_signals: matchedSignals,
    detected_failures: detectedFailures,
    domain_relevance,
  };
}
```

**Step 2: Wire into `after_tool_call` hook**

After each tool call, run `annotateToolResult` and persist the annotation in the run trace context. This annotation is available to the verifier gate and to trace persistence for post-hoc analysis.

**Step 3: Write tests**

Test signal pattern matching. Test failure indicator detection. Test that unmatched results get "low" relevance.

**Step 4: Run tests and commit**

```
feat(niche): add domain-aware observation processing
```

---

### Task 6: Constraint Enforcement — Active Domain Constraint Checking

**Files:**

- Create: `src/niche/runtime/constraint-enforcer.ts`
- Test: `test/niche/runtime/constraint-enforcer.test.ts`

**What this does:** Domain constraints (from the DomainPack) are actively enforced during tool execution and output generation — not just recorded. High-severity constraint violations block tool calls. Moderate-severity violations trigger warnings in the trace.

**Step 1: Create the constraint enforcer**

```typescript
// src/niche/runtime/constraint-enforcer.ts
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
  if (!config) return { passed: true, violations: [] };

  const violations: ConstraintCheckResult["violations"] = [];

  for (const constraint of config.constraints) {
    const rule = constraint.rule;
    let violated = false;

    if (rule.startsWith("must_include:")) {
      const required = rule.slice("must_include:".length);
      if (!content.toLowerCase().includes(required.toLowerCase())) {
        violated = true;
      }
    } else if (rule.startsWith("must_not_include:")) {
      const forbidden = rule.slice("must_not_include:".length);
      if (content.toLowerCase().includes(forbidden.toLowerCase())) {
        violated = true;
      }
    }

    if (violated) {
      violations.push({
        constraint_id: constraint.constraint_id,
        rule: constraint.rule,
        severity: constraint.severity,
        blocking: constraint.severity === "high" || constraint.severity === "critical",
      });
    }
  }

  return {
    passed: violations.filter((v) => v.blocking).length === 0,
    violations,
  };
}
```

**Step 2: Wire into verifier gate**

Extend `maybeRunNicheVerifierGate` in `src/niche/runtime/verifier-gate.ts` to also run `checkDomainConstraints` on the output. If blocking constraints are violated, the verifier should veto even if the grounding check passes.

**Step 3: Wire into action mediator**

Extend the action mediation path to check constraints on tool arguments before execution.

**Step 4: Write tests**

Test `must_include` enforcement. Test `must_not_include` enforcement. Test that high-severity violations block. Test that moderate-severity violations are recorded but don't block.

**Step 5: Run tests and commit**

```
feat(niche): add active domain constraint enforcement
```

---

### Task 7: Repair Loop — Domain-Aware Retry and Recovery

**Files:**

- Modify: `src/niche/runtime/verifier-gate.ts`
- Test: `test/niche/runtime/repair-loop.test.ts`

**What this does:** When the verifier vetoes or requests repair, the system uses the compiled domain config to generate specific repair guidance. The `max_repair_attempts` from the action policy controls how many retries are allowed. Repair prompts include the specific constraint violation and how to fix it.

**Step 1: Extend verifier gate repair logic**

When `decision.outcome === "repair_requested"`, build a repair prompt from:

- The specific findings that triggered repair
- The relevant domain constraints
- The evidence requirements from the compiled config

The repair prompt is domain-specific: "Your output violated constraint [X]. The domain requires [Y]. Please revise to include [Z]."

**Step 2: Add retry counting**

Track repair attempts in the run trace context. Stop retrying after `action_policy_runtime.max_repair_attempts`.

**Step 3: Write tests**

Test that repair prompts include constraint-specific guidance. Test that retry counting respects the max. Test that exhausted retries escalate to block.

**Step 4: Run tests and commit**

```
feat(niche): add domain-aware repair loop with retry limits
```

---

### Task 8: Auto-Generated Baseline from Unspecialized Agent

**Files:**

- Create: `src/niche/domain/baseline-snapshot.ts`
- Modify: `src/niche/domain/manifest-builder.ts`
- Test: `test/niche/domain/baseline-snapshot.test.ts`

**What this does:** When no explicit baseline manifest is provided, the system automatically snapshots the current agent's unspecialized configuration as the control arm for benchmarking. This makes the "verifiably better than a general agent" claim airtight by default.

**Step 1: Create baseline snapshot function**

```typescript
// src/niche/domain/baseline-snapshot.ts
export function snapshotUnspecializedBaseline(params: {
  agentId: string;
  provider: string;
  modelId: string;
  apiMode: string;
  nicheProgramId: string;
  benchmarkSuiteId: string;
  sourceAccessManifestId: string;
}): BaselineManifest {
  // Build a manifest that represents the agent with zero niche configuration:
  // - No domain pack
  // - No action policy overlay (all tools allowed)
  // - No verifier gate
  // - No domain constraints
  // - Same model and provider as candidate (same-model comparison)
}
```

**Step 2: Wire into manifest builder**

In `buildStarterManifests`, if no explicit baseline manifest is provided, call `snapshotUnspecializedBaseline` to generate one automatically.

**Step 3: Write tests**

Test that the snapshot produces a valid BaselineManifest. Test that it has no domain-specific configuration. Test that it uses the same model/provider as the candidate.

**Step 4: Run tests and commit**

```
feat(niche): auto-generate baseline from unspecialized agent state
```

---

### Task 9: Compile Flow Integration — Wire Config Compilation into Existing Pipeline

**Files:**

- Modify: `src/niche/domain/compile-flow.ts`
- Modify: `src/niche/store/domain-pack-store.ts` (persist compiled config alongside domain pack)
- Test: `test/niche/domain/compile-flow-config.test.ts`

**What this does:** The existing `compileNicheProgramFlow` now also runs `compileDomainConfig` on the produced domain pack and persists the compiled config alongside the compilation record. This ensures every compilation produces both the domain knowledge (DomainPack) and the operating configuration (CompiledDomainConfig).

**Step 1: Extend compilation record**

Add `compiled_domain_config` to the `NicheCompilationRecord` type. After domain pack compilation, call `compileDomainConfig` and include the result in the persisted record.

**Step 2: Extend store**

The compilation record store already persists the full record. The compiled config is carried as a field, not a separate store entry.

**Step 3: Write tests**

Test that `compileNicheProgramFlow` produces a compilation record with a `compiled_domain_config` field. Test that the config's planner directives reflect the domain pack's constraints.

**Step 4: Run full niche suite**

Run: `npx vitest run --config vitest.niche.config.ts`
Expected: All passing

**Step 5: Commit**

```
feat(niche): wire CompiledDomainConfig into compile flow
```

---

### Task 10: End-to-End Verification — Specialized Agent Is Different from General Agent

**Files:**

- Create: `test/niche/e2e/specialization-proof.test.ts`

**What this does:** A single integration test that proves the specialized agent's pipeline is materially different from the general agent's pipeline. Not a benchmark — a structural assertion that the domain configuration is active at every stage.

**Step 1: Write the test**

```typescript
describe("specialization proof", () => {
  it("transforms every pipeline stage when a niche run is active", async () => {
    await withTempHome(async () => {
      // 1. Compile a domain with specific constraints, terminology, tools
      // 2. Register a niche run with the compiled seed
      // 3. Assert: planner prompt block is non-null and contains domain identity
      // 4. Assert: tool ranking puts domain tools first
      // 5. Assert: observation annotation detects domain-specific signals
      // 6. Assert: constraint enforcer catches domain violations
      // 7. Assert: verifier gate uses domain pack for grounding checks
      // 8. Assert: compiled domain config is persisted in compilation record
      // Then prove the general agent is different:
      // 9. Assert: without niche run, planner block is null
      // 10. Assert: without niche run, no tool ranking
      // 11. Assert: without niche run, no observation annotation
      // 12. Assert: without niche run, no constraint enforcement
    });
  });
});
```

**Step 2: Run test**

Run: `npx vitest run --config vitest.niche.config.ts test/niche/e2e/specialization-proof.test.ts`
Expected: PASS

**Step 3: Run full suite + build**

Run: `npx vitest run --config vitest.niche.config.ts`
Run: `pnpm build:strict-smoke`
Expected: All passing

**Step 4: Commit**

```
test(niche): prove specialization transforms every pipeline stage
```

---

## Dependency Graph

```
Task 1 (CompiledDomainConfig schema)
  ↓
Task 2 (Carry config in trace context)
  ↓
  ├── Task 3 (Planner injection)
  ├── Task 4 (Tool ranking + argument defaults)
  ├── Task 5 (Observation processing)
  ├── Task 6 (Constraint enforcement)
  └── Task 7 (Repair loop)
       ↓
Task 8 (Auto-generated baseline) — independent, can parallelize with 3-7
Task 9 (Compile flow integration) — depends on Task 1
Task 10 (E2E specialization proof) — depends on all
```

## Parallelization Strategy

**Wave 1:** Tasks 1-2 (sequential — schema then context binding)
**Wave 2:** Tasks 3, 4, 5, 6, 8 (parallel — each binds a different seam)
**Wave 3:** Tasks 7, 9 (depend on earlier tasks)
**Wave 4:** Task 10 (final verification)

## What This Achieves

After all 10 tasks, a NicheClaw-compiled agent:

- **Reasons differently**: planner sees domain identity, constraints, terminology, failure modes, evidence requirements, and few-shot exemplars
- **Selects tools differently**: tools ranked by domain relevance, domain-specific argument defaults injected
- **Processes observations differently**: domain signal extraction and failure indicator detection on every tool result
- **Enforces constraints actively**: domain rules checked on outputs and tool arguments, high-severity violations block execution
- **Recovers differently**: repair prompts are domain-specific, retry limits are configurable
- **Benchmarks honestly**: auto-generated baseline from unspecialized agent makes "verifiably better" the default

The "training" is the compilation process that transforms every pipeline stage. The benchmark proves it works. The release gates it. The monitor watches it.
