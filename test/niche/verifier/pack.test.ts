import { describe, expect, it } from "vitest";
import {
  RunTraceSchema,
  SourceAccessManifestSchema,
  VerifierDecisionRecordSchema,
  type DomainPack,
  type EvidenceBundleRef,
  type RunTrace,
  type SourceAccessManifest,
} from "../../../src/niche/schema/index.js";
import {
  computeVerifierMetrics,
  createVerifierPackConfig,
  runVerifierPack,
  toRunTraceVerifierDecisionRecord,
  type VerifierMetricInput,
} from "../../../src/niche/verifier/index.js";
import { validateJsonSchemaValue } from "../../../src/plugins/schema-validator.js";

function makeDomainPack(): DomainPack {
  return {
    domain_pack_id: "repo-ci-pack",
    niche_program_id: "repo-ci-specialist",
    version: "2026.3.12",
    ontology: {
      concepts: [
        {
          id: "source-repo-doc",
          label: "Repo policy document",
          description: "Approved repo policy guidance.",
        },
      ],
      relations: [],
    },
    task_taxonomy: [
      {
        task_family_id: "repo-ci-verification",
        label: "Repo CI verification",
        description: "Grounded repo and CI work.",
        benchmarkable: true,
        required_capabilities: ["evidence_grounding", "constraint_validation"],
      },
    ],
    terminology_map: {
      repo: {
        canonical_term: "repo",
        synonyms: ["repository"],
        definition: "The current code workspace.",
      },
    },
    constraints: [
      {
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:tests passed",
        rationale: "Verification output must include the test status.",
        severity: "moderate",
      },
      {
        constraint_id: "forbid-fabrication",
        category: "output",
        rule: "must_not_include:hallucinated",
        rationale: "The verifier should reject fabricated status claims.",
        severity: "high",
      },
    ],
    tool_contracts: [
      {
        tool_name: "exec",
        intent_summary: "Run terminal commands in the repo.",
        required_arguments: ["command"],
        optional_arguments: [],
        failure_modes: ["missing_evidence"],
      },
    ],
    evidence_source_registry: [
      {
        source_id: "source-repo-doc",
        source_kind: "repo_file",
        title: "Repo policy document",
        access_pattern: "read_file",
        freshness_expectation: "daily",
        trust_notes: "Approved internal source.",
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "missing_evidence",
        label: "Missing evidence",
        description: "The answer cannot be grounded in approved evidence.",
        severity: "high",
        detection_hints: ["no citation", "unsupported claim"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding", "output_constraints"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: ["grounded_response", "must_include:tests passed"],
      escalation_policy: "Escalate low-confidence outputs before user delivery.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "repo-ci-seed",
        task_family_id: "repo-ci-verification",
        prompt: "Explain the verification status.",
        source_refs: ["source-repo-doc"],
        pass_conditions: ["grounded_response"],
        hard_fail_conditions: ["unapproved_source_use"],
      },
    ],
  };
}

function makeSourceAccessManifest(): SourceAccessManifest {
  return {
    source_access_manifest_id: "source-access-repo-ci",
    allowed_tools: ["exec", "read"],
    allowed_retrieval_indices: ["source-repo-doc"],
    allowed_live_sources: [],
    disallowed_sources: ["source-secret"],
    sandbox_policy: "workspace-only",
    network_policy: "deny",
    approval_policy: "never",
  };
}

function makeEvidenceBundle(
  deliveredEvidence: string[],
  sourceId = "source-repo-doc",
): EvidenceBundleRef {
  return {
    evidence_bundle_id: "bundle-1",
    source_refs: [
      {
        source_id: sourceId,
        source_hash_or_ref: "sha256:bundle-1",
      },
    ],
    retrieval_query: "repo ci verification",
    reranker_output: [sourceId],
    delivered_evidence: deliveredEvidence,
  };
}

function makeMinimalRunTrace(): RunTrace {
  return {
    trace_id: "trace-1",
    run_id: "run-1",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-pack",
    mode: "candidate",
    session_ref: {
      session_id: "session-1",
    },
    planner_inputs: [
      {
        stage_id: "planner-input-1",
        summary: "Planner received repo task.",
      },
    ],
    planner_outputs: [
      {
        stage_id: "planner-output-1",
        summary: "Planner selected candidate stack.",
      },
    ],
    action_proposals: [
      {
        proposal_id: "proposal-1",
        selected_tool: "exec",
        selected_reason: "Run tests",
        guard_decision: "allowed",
        candidate_rankings: [],
        attempt_index: 0,
      },
    ],
    tool_calls: [
      {
        tool_call_id: "tool-call-1",
        tool_name: "exec",
        status: "completed",
        arguments_summary: "pnpm test",
        output_summary: "tests passed",
      },
    ],
    observations: [
      {
        observation_id: "observation-1",
        source: "tool",
        summary: "Test execution succeeded.",
      },
    ],
    verifier_decisions: [],
    terminal_status: "delivered",
    final_output: {
      output_id: "output-1",
      output_type: "text",
      content_summary: "All tests passed.",
      emitted_to_user: false,
    },
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    },
    latency: {
      planner_ms: 10,
      tool_ms: 20,
      verifier_ms: 5,
      end_to_end_ms: 35,
    },
    cost: {
      currency: "USD",
      total_cost: 0.02,
    },
    failure_labels: [],
    artifact_refs: [],
    baseline_or_candidate_manifest_id: "candidate-manifest-1",
    readiness_report_id: "repo-ci-specialist-readiness",
    planner_version_id: "planner-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-v1",
    retrieval_stack_version_id: "retrieval-v1",
    grader_set_version_id: "grader-set-v1",
    source_access_manifest_id: "source-access-repo-ci",
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    evidence_bundle_refs: [makeEvidenceBundle(["Tests passed in CI for the repo."])],
    determinism_policy_id: "determinism-policy-v1",
    random_seed: "seed-1",
    phase_timestamps: {
      planner_started_at: "2026-03-12T12:00:00.000Z",
      planner_finished_at: "2026-03-12T12:00:01.000Z",
      action_proposal_started_at: "2026-03-12T12:00:01.000Z",
      action_proposal_finished_at: "2026-03-12T12:00:02.000Z",
      tool_execution_started_at: "2026-03-12T12:00:02.000Z",
      tool_execution_finished_at: "2026-03-12T12:00:03.000Z",
      verifier_started_at: "2026-03-12T12:00:03.000Z",
      verifier_finished_at: "2026-03-12T12:00:04.000Z",
      final_emission_at: "2026-03-12T12:00:04.000Z",
      trace_persisted_at: "2026-03-12T12:00:05.000Z",
    },
    wall_clock_start_at: "2026-03-12T12:00:00.000Z",
    wall_clock_end_at: "2026-03-12T12:00:05.000Z",
    replayability_status: "replayable",
    determinism_notes: "Replayable under fixed fixtures.",
  };
}

describe("verifier pack core", () => {
  it("approves grounded outputs and produces a serializable run-trace decision record", () => {
    const domainPack = makeDomainPack();
    const config = createVerifierPackConfig({
      verifierPackId: "verifier-pack-repo-ci",
      version: "2026.3.12",
      domainPack,
      minConfidence: 0.6,
      releaseGuardrails: {
        max_latency_added_ms: 250,
        max_cost_added: 0.5,
      },
    });

    const decision = runVerifierPack({
      config,
      input: {
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        candidate_output:
          "Tests passed based on the repo policy document and tests passed evidence.",
        output_format: "text",
        domain_pack: domainPack,
        source_access_manifest: makeSourceAccessManifest(),
        evidence_bundle_refs: [
          makeEvidenceBundle([
            "Repo policy document says tests passed evidence is required before delivery.",
          ]),
        ],
        checked_at: "2026-03-12T12:01:00.000Z",
        model_confidence: 0.92,
        latency_added_ms: 40,
        cost_added: 0.03,
      },
    });

    expect(decision.outcome).toBe("approved");
    expect(decision.findings).toEqual([]);

    const record = toRunTraceVerifierDecisionRecord(decision);
    const recordValidation = validateJsonSchemaValue({
      schema: VerifierDecisionRecordSchema,
      cacheKey: "test-verifier-record",
      value: record,
    });
    expect(recordValidation.ok).toBe(true);

    const trace = makeMinimalRunTrace();
    trace.verifier_decisions = [record];
    const traceValidation = validateJsonSchemaValue({
      schema: RunTraceSchema,
      cacheKey: "test-run-trace",
      value: trace,
    });
    expect(traceValidation.ok).toBe(true);
  });

  it("vetoes outputs when evidence is missing or source access is invalid", () => {
    const decision = runVerifierPack({
      config: createVerifierPackConfig({
        verifierPackId: "verifier-pack-repo-ci",
        version: "2026.3.12",
        domainPack: makeDomainPack(),
      }),
      input: {
        run_id: "run-2",
        niche_program_id: "repo-ci-specialist",
        candidate_output: "Tests passed.",
        output_format: "text",
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        evidence_bundle_refs: [makeEvidenceBundle(["Secret evidence."], "source-secret")],
        checked_at: "2026-03-12T12:02:00.000Z",
        model_confidence: 0.95,
      },
    });

    expect(decision.outcome).toBe("vetoed");
    expect(decision.findings.map((finding) => finding.finding_id)).toContain(
      "disallowed_source_source-secret",
    );
  });

  it("requests repair for grounded outputs that miss required constraint content", () => {
    const decision = runVerifierPack({
      config: createVerifierPackConfig({
        verifierPackId: "verifier-pack-repo-ci",
        version: "2026.3.12",
        domainPack: makeDomainPack(),
      }),
      input: {
        run_id: "run-3",
        niche_program_id: "repo-ci-specialist",
        candidate_output: "Repo policy document requires verification before delivery.",
        output_format: "text",
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        evidence_bundle_refs: [
          makeEvidenceBundle([
            "Repo policy document requires tests passed evidence before delivery.",
          ]),
        ],
        checked_at: "2026-03-12T12:03:00.000Z",
        model_confidence: 0.9,
      },
    });

    expect(decision.outcome).toBe("repair_requested");
    expect(decision.findings.some((finding) => finding.category === "constraint")).toBe(true);
  });

  it("escalates low-confidence outputs without turning them into false vetoes", () => {
    const decision = runVerifierPack({
      config: createVerifierPackConfig({
        verifierPackId: "verifier-pack-repo-ci",
        version: "2026.3.12",
        domainPack: makeDomainPack(),
        minConfidence: 0.8,
      }),
      input: {
        run_id: "run-4",
        niche_program_id: "repo-ci-specialist",
        candidate_output:
          "Tests passed based on the repo policy document and tests passed evidence.",
        output_format: "text",
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        evidence_bundle_refs: [
          makeEvidenceBundle([
            "Repo policy document says tests passed evidence is required before delivery.",
          ]),
        ],
        checked_at: "2026-03-12T12:04:00.000Z",
        model_confidence: 0.55,
      },
    });

    expect(decision.outcome).toBe("escalated");
    expect(decision.findings.map((finding) => finding.finding_id)).toContain(
      "low_verifier_confidence",
    );
  });
});

describe("verifier metrics", () => {
  it("aggregates false-veto-sensitive operational metrics for promotion decisions", () => {
    const decisionA = runVerifierPack({
      config: createVerifierPackConfig({
        verifierPackId: "verifier-pack-repo-ci",
        version: "2026.3.12",
        domainPack: makeDomainPack(),
      }),
      input: {
        run_id: "run-5",
        niche_program_id: "repo-ci-specialist",
        candidate_output:
          "Tests passed based on the repo policy document and tests passed evidence.",
        output_format: "text",
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        evidence_bundle_refs: [
          makeEvidenceBundle([
            "Repo policy document says tests passed evidence is required before delivery.",
          ]),
        ],
        checked_at: "2026-03-12T12:05:00.000Z",
        model_confidence: 0.9,
        latency_added_ms: 50,
        cost_added: 0.04,
      },
    });
    const decisionB = runVerifierPack({
      config: createVerifierPackConfig({
        verifierPackId: "verifier-pack-repo-ci",
        version: "2026.3.12",
        domainPack: makeDomainPack(),
      }),
      input: {
        run_id: "run-6",
        niche_program_id: "repo-ci-specialist",
        candidate_output: "hallucinated status",
        output_format: "text",
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        evidence_bundle_refs: [makeEvidenceBundle(["Approved evidence."])],
        checked_at: "2026-03-12T12:06:00.000Z",
        model_confidence: 0.9,
        latency_added_ms: 70,
        cost_added: 0.06,
      },
    });

    const inputs: VerifierMetricInput[] = [
      {
        case_id: "case-1",
        decision: decisionA,
        ground_truth: "should_allow",
        operator_override_applied: false,
      },
      {
        case_id: "case-2",
        decision: decisionB,
        ground_truth: "should_intervene",
        operator_override_applied: true,
      },
      {
        case_id: "case-3",
        decision: { ...decisionB, outcome: "vetoed" },
        ground_truth: "should_allow",
        operator_override_applied: false,
      },
    ];

    const metrics = computeVerifierMetrics(inputs);

    expect(metrics.sample_count).toBe(3);
    expect(metrics.counts.true_positive).toBe(1);
    expect(metrics.counts.false_veto).toBe(1);
    expect(metrics.counts.pass_through).toBe(1);
    expect(metrics.override_rate).toBeCloseTo(1 / 3);
    expect(metrics.mean_latency_added_ms).toBeCloseTo((50 + 70 + 70) / 3);
    expect(metrics.total_cost_added).toBeCloseTo(0.16);
  });
});

describe("verifier input schemas", () => {
  it("keeps declared source access serializable for verifier inputs", () => {
    const validation = validateJsonSchemaValue({
      schema: SourceAccessManifestSchema,
      cacheKey: "test-source-access",
      value: makeSourceAccessManifest(),
    });
    expect(validation.ok).toBe(true);
  });
});
