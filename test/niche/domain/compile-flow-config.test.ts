import { describe, expect, it } from "vitest";
import { compileNicheProgramFlow } from "../../../src/niche/domain/compile-flow.js";
import type { SourceDescriptor } from "../../../src/niche/domain/source-types.js";
import type { NicheProgram } from "../../../src/niche/schema/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeNicheProgram(): NicheProgram {
  return {
    niche_program_id: "repo-ci-specialist",
    name: "Repo CI Specialist",
    objective: "Improve repo and CI execution quality.",
    risk_class: "moderate",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner-primary",
        provider: "openai",
        model_id: "gpt-5",
        api_mode: "responses",
        notes: "Primary planner runtime.",
      },
      retrieval_components: [],
      verifier_components: [],
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read", "exec", "apply_patch"],
    allowed_sources: [
      {
        source_id: "repo-root",
        source_kind: "repos",
        description: "Primary repo.",
        access_pattern: "workspace",
      },
    ],
    success_metrics: [
      {
        metric_id: "task-success",
        label: "Task success",
        objective: "maximize",
        target_description: "Improve held-out task completion.",
        measurement_method: "benchmark grading",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store approved sources",
      training_policy: "train only on approved sources",
      benchmark_policy: "keep eval sources held out",
      retention_policy: "retain according to governance policy",
      redaction_policy: "redact sensitive material first",
      pii_policy: "avoid unreviewed PII",
      live_trace_reuse_policy: "embargo live traces before reuse",
      operator_review_required: true,
    },
  };
}

function makeSourceDescriptors(): SourceDescriptor[] {
  return [
    {
      sourceId: "repo-source",
      sourceKind: "repos",
      inputKind: "structured_text",
      title: "Repo Source",
      text: "The repo requires grounded build and test verification before delivery.",
      accessPattern: "workspace",
      rights: {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        data_zone: "dev",
      },
      freshnessExpectation: "daily",
      trustNotes: "Approved repo guidance.",
    },
    {
      sourceId: "benchmark-seed-source",
      sourceKind: "human_examples",
      inputKind: "benchmark_seed",
      title: "Benchmark Seed Source",
      prompt: "Reproduce the failing CI build and explain the root cause.",
      taskFamilyId: "ci-repair",
      passConditions: ["correct_root_cause"],
      hardFailConditions: ["unsafe_command_use"],
      accessPattern: "seed",
      rights: {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        provenance_status: "verified",
        data_zone: "dev",
      },
      freshnessExpectation: "daily",
      trustNotes: "Approved benchmark seed.",
    },
  ];
}

describe("compile flow produces compiled domain config", () => {
  it("includes compiled_domain_config in the compilation record", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v1",
        compiledAt: "2026-03-14T10:00:00.000Z",
      });

      expect(result.compiled_domain_config).toBeDefined();
      expect(result.compilation.compiled_domain_config).toBeDefined();

      // The persisted record and the returned config should match on identity fields
      const config = result.compiled_domain_config;
      expect(config.niche_program_id).toBe("repo-ci-specialist");
      expect(config.domain_pack_id).toBe("repo-ci-specialist-pack");
      expect(config.version).toBe("config-test-v1");
    });
  });

  it("planner directives reflect the domain pack constraints", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v2",
        compiledAt: "2026-03-14T11:00:00.000Z",
      });

      const config = result.compiled_domain_config;
      const domainPack = result.compilation.domain_pack;

      // Domain identity references the niche program id
      expect(config.planner.domain_identity).toContain("repo-ci-specialist");

      // Reasoning constraints mirror domain pack constraints
      expect(config.planner.reasoning_constraints.length).toBe(domainPack.constraints.length);
      for (const constraint of domainPack.constraints) {
        const matching = config.planner.reasoning_constraints.find((rc) =>
          rc.includes(constraint.rule),
        );
        expect(matching).toBeDefined();
        expect(matching).toContain(constraint.severity);
      }

      // Failure awareness mirrors failure taxonomy
      expect(config.planner.failure_awareness.length).toBe(domainPack.failure_taxonomy.length);
      for (const failure of domainPack.failure_taxonomy) {
        const matching = config.planner.failure_awareness.find((fa) => fa.includes(failure.label));
        expect(matching).toBeDefined();
      }

      // Evidence requirements come from verifier defaults
      expect(config.planner.evidence_requirements).toEqual(
        domainPack.verifier_defaults.output_requirements,
      );

      // Task decomposition hints mirror task taxonomy
      expect(config.planner.task_decomposition_hints.length).toBe(domainPack.task_taxonomy.length);
      for (const task of domainPack.task_taxonomy) {
        const matching = config.planner.task_decomposition_hints.find((hint) =>
          hint.includes(task.label),
        );
        expect(matching).toBeDefined();
      }
    });
  });

  it("tool directives match the domain pack tool contracts", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v3",
        compiledAt: "2026-03-14T12:00:00.000Z",
      });

      const config = result.compiled_domain_config;
      const domainPack = result.compilation.domain_pack;

      // One tool directive per tool contract
      expect(config.tools.length).toBe(domainPack.tool_contracts.length);

      const toolNames = config.tools.map((t) => t.tool_name).toSorted();
      const contractNames = domainPack.tool_contracts.map((tc) => tc.tool_name).toSorted();
      expect(toolNames).toEqual(contractNames);

      for (const toolDirective of config.tools) {
        const contract = domainPack.tool_contracts.find(
          (tc) => tc.tool_name === toolDirective.tool_name,
        );
        expect(contract).toBeDefined();
        expect(toolDirective.domain_intent).toBe(contract!.intent_summary);
        expect(toolDirective.failure_modes).toEqual(contract!.failure_modes);
        expect(toolDirective.required_arguments).toEqual(contract!.required_arguments);
        expect(toolDirective.domain_relevance_score).toBe(1.0);
      }
    });
  });

  it("observation directives include evidence sources and failure indicators", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v4",
        compiledAt: "2026-03-14T13:00:00.000Z",
      });

      const config = result.compiled_domain_config;
      const domainPack = result.compilation.domain_pack;

      // Signal patterns match evidence source registry
      expect(config.observation.signal_patterns.length).toBe(
        domainPack.evidence_source_registry.length,
      );
      for (const source of domainPack.evidence_source_registry) {
        const pattern = config.observation.signal_patterns.find(
          (sp) => sp.source_id === source.source_id,
        );
        expect(pattern).toBeDefined();
        expect(pattern!.pattern_description).toBe(source.title);
      }

      // Failure indicators match failure taxonomy
      expect(config.observation.failure_indicators.length).toBe(domainPack.failure_taxonomy.length);
      for (const failure of domainPack.failure_taxonomy) {
        const indicator = config.observation.failure_indicators.find(
          (fi) => fi.failure_id === failure.failure_id,
        );
        expect(indicator).toBeDefined();
        expect(indicator!.severity).toBe(failure.severity);
      }
    });
  });

  it("retrieval directives list approved sources", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v5",
        compiledAt: "2026-03-14T14:00:00.000Z",
      });

      const config = result.compiled_domain_config;
      const domainPack = result.compilation.domain_pack;

      expect(config.retrieval.approved_source_ids).toEqual(
        domainPack.evidence_source_registry.map((src) => src.source_id),
      );
      for (const sourceId of config.retrieval.approved_source_ids) {
        expect(config.retrieval.source_descriptions[sourceId]).toBeDefined();
      }
    });
  });

  it("exemplar directives come from benchmark seed specs", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v6",
        compiledAt: "2026-03-14T15:00:00.000Z",
      });

      const config = result.compiled_domain_config;
      const domainPack = result.compilation.domain_pack;

      expect(config.exemplars.length).toBe(domainPack.benchmark_seed_specs.length);
      for (const seed of domainPack.benchmark_seed_specs) {
        const exemplar = config.exemplars.find((e) => e.seed_id === seed.seed_id);
        expect(exemplar).toBeDefined();
        expect(exemplar!.task_family_id).toBe(seed.task_family_id);
        expect(exemplar!.prompt).toBe(seed.prompt);
        expect(exemplar!.pass_conditions).toEqual(seed.pass_conditions);
        expect(exemplar!.hard_fail_conditions).toEqual(seed.hard_fail_conditions);
      }
    });
  });

  it("constraint enforcement directives mirror domain pack constraints", async () => {
    await withTempHome(async () => {
      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-v7",
        compiledAt: "2026-03-14T16:00:00.000Z",
      });

      const config = result.compiled_domain_config;
      const domainPack = result.compilation.domain_pack;

      expect(config.constraints.length).toBe(domainPack.constraints.length);
      for (const constraint of domainPack.constraints) {
        const enforcement = config.constraints.find(
          (c) => c.constraint_id === constraint.constraint_id,
        );
        expect(enforcement).toBeDefined();
        expect(enforcement!.category).toBe(constraint.category);
        expect(enforcement!.rule).toBe(constraint.rule);
        expect(enforcement!.severity).toBe(constraint.severity);
        expect(enforcement!.rationale).toBe(constraint.rationale);
      }
    });
  });

  it("idempotent: re-running with same inputs yields same compilation record", async () => {
    await withTempHome(async () => {
      const opts = {
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: makeSourceDescriptors(),
        version: "config-test-idem",
        compiledAt: "2026-03-14T17:00:00.000Z",
      };

      const first = await compileNicheProgramFlow(opts);
      const second = await compileNicheProgramFlow(opts);

      expect(second.compilation_record_path).toBe(first.compilation_record_path);
      expect(second.compilation.compiled_domain_config).toBeDefined();
    });
  });

  it("computes contradiction_rate from source metadata, not hardcoded", async () => {
    await withTempHome(async () => {
      // Two sources with overlapping content but contradictory provenance_status.
      // The first is "verified", the second is "disputed" — this metadata conflict
      // combined with token overlap should produce a non-zero contradiction_rate.
      const sharedRights = {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        data_zone: "dev" as const,
      };
      const overlappingText =
        "Always verify build artifacts before deployment to production environment";

      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: [
          {
            sourceId: "source-verified",
            sourceKind: "documents" as const,
            inputKind: "structured_text" as const,
            title: "Verified Source",
            text: overlappingText,
            accessPattern: "read_only",
            rights: { ...sharedRights, provenance_status: "verified" },
          },
          {
            sourceId: "source-disputed",
            sourceKind: "documents" as const,
            inputKind: "structured_text" as const,
            title: "Disputed Source",
            text: overlappingText,
            accessPattern: "read_only",
            rights: { ...sharedRights, provenance_status: "disputed" },
          },
        ],
        version: "contradiction-test-v1",
        compiledAt: "2026-03-14T18:00:00.000Z",
      });

      const report = result.compilation.readiness_report;
      // contradiction_rate must NOT be the old hardcoded value of 5
      expect(report.dimension_scores.contradiction_rate.score).not.toBe(5);
      // With identical content and contradictory provenance, rate should be elevated
      expect(report.dimension_scores.contradiction_rate.score).toBeGreaterThan(0);
    });
  });

  it("contradiction_rate blocker fires when sources have high overlap and contradictory metadata", async () => {
    await withTempHome(async () => {
      // Two sources with identical content but contradictory provenance_status.
      // Score should be (1 contradiction / 1 pair) * 100 = 100, which exceeds the 30 threshold.
      const sharedRights = {
        rights_to_store: true,
        rights_to_train: true,
        rights_to_benchmark: true,
        rights_to_derive: true,
        rights_to_distill: true,
        rights_to_generate_synthetic_from: true,
        retention_policy: "retain",
        redaction_status: "clean",
        pii_status: "none",
        data_zone: "dev" as const,
      };
      const overlappingText =
        "Always verify build artifacts before deployment to production environment";

      const result = await compileNicheProgramFlow({
        nicheProgram: makeNicheProgram(),
        sourceDescriptors: [
          {
            sourceId: "blocker-source-verified",
            sourceKind: "documents" as const,
            inputKind: "structured_text" as const,
            title: "Verified Source",
            text: overlappingText,
            accessPattern: "read_only",
            rights: { ...sharedRights, provenance_status: "verified" },
          },
          {
            sourceId: "blocker-source-disputed",
            sourceKind: "documents" as const,
            inputKind: "structured_text" as const,
            title: "Disputed Source",
            text: overlappingText,
            accessPattern: "read_only",
            rights: { ...sharedRights, provenance_status: "disputed" },
          },
          {
            sourceId: "blocker-benchmark-seed",
            sourceKind: "human_examples" as const,
            inputKind: "benchmark_seed" as const,
            title: "Benchmark Seed",
            prompt: "Run a task and verify outcome.",
            taskFamilyId: "ci-repair",
            passConditions: ["correct_outcome"],
            hardFailConditions: ["unsafe_action"],
            accessPattern: "seed",
            rights: { ...sharedRights, provenance_status: "verified" },
          },
        ],
        version: "contradiction-blocker-test-v1",
        compiledAt: "2026-03-14T19:00:00.000Z",
      });

      const report = result.compilation.readiness_report;
      // contradiction_rate should exceed the hard threshold of 30
      expect(report.dimension_scores.contradiction_rate.score).toBeGreaterThan(30);
      // The readiness gate should mark this as not_ready due to contradiction blocker
      expect(report.status).toBe("not_ready");
      expect(
        report.hard_blockers.some(
          (b) => b.blocker_code === "contradiction_rate_exceeds_hard_threshold",
        ),
      ).toBe(true);
    });
  });
});
