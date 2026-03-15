import { describe, expect, it } from "vitest";
import { prepareNicheRunSeed } from "../../../src/niche/runtime/prepare-run-seed.js";
import type {
  BaselineManifest,
  CandidateManifest,
  DomainPack,
  PreparedNicheActionPolicyRuntime,
  SourceAccessManifest,
} from "../../../src/niche/schema/index.js";

function makeDomainPack(): DomainPack {
  return {
    domain_pack_id: "repo-ci-pack",
    niche_program_id: "repo-ci-specialist",
    version: "2026.3.12",
    ontology: {
      concepts: [{ id: "repo-doc", label: "Repo doc" }],
      relations: [],
    },
    task_taxonomy: [
      {
        task_family_id: "repo-ci-verification",
        label: "Repo CI verification",
        benchmarkable: true,
        required_capabilities: ["evidence_grounding"],
      },
    ],
    terminology_map: {},
    constraints: [
      {
        constraint_id: "must-ground-output",
        category: "grounding",
        rule: "must_ground_in_evidence",
        severity: "moderate",
      },
    ],
    tool_contracts: [
      {
        tool_name: "exec",
        intent_summary: "Run repo commands.",
        required_arguments: ["command"],
        optional_arguments: ["cwd"],
        failure_modes: ["missing_evidence"],
      },
      {
        tool_name: "read",
        intent_summary: "Read repo files.",
        required_arguments: ["path"],
        optional_arguments: [],
        failure_modes: ["missing_evidence"],
      },
    ],
    evidence_source_registry: [
      {
        source_id: "repo-doc",
        source_kind: "repos",
        title: "Repository",
        access_pattern: "read",
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "missing_evidence",
        label: "Missing evidence",
        description: "The answer is not grounded.",
        severity: "high",
        detection_hints: ["unsupported claim"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence responses.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "seed-1",
        task_family_id: "repo-ci-verification",
        prompt: "Investigate the failing benchmark case.",
        source_refs: ["repo-doc"],
        pass_conditions: ["grounded_response"],
        hard_fail_conditions: [],
      },
    ],
  };
}

function makeSourceAccessManifest(): SourceAccessManifest {
  return {
    source_access_manifest_id: "source-access-repo-ci",
    allowed_tools: ["exec", "read"],
    allowed_retrieval_indices: ["repo-doc"],
    allowed_live_sources: [],
    disallowed_sources: [],
    sandbox_policy: "workspace-only",
    network_policy: "deny",
    approval_policy: "never",
  };
}

function makeCandidateManifest(): CandidateManifest {
  return {
    candidate_manifest_id: "candidate-manifest-repo-ci",
    based_on_baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T12:00:00.000Z",
    planner_runtime: {
      component_id: "planner-primary-v1",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:59:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned candidate metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-repo-ci",
    retry_policy: { max_attempts: 2 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Candidate manifest",
    domain_pack_id: "repo-ci-pack",
    action_policy_id: "action-policy-v1",
    retrieval_stack_id: "retrieval-stack-v1",
    verifier_pack_id: "verifier-pack-v1",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { policy: "baseline" },
    verifier_config: { pack: "baseline" },
    optional_student_model_ids: [],
    candidate_recipe: "candidate-recipe-v1",
  };
}

function makeBaselineManifest(): BaselineManifest {
  return {
    baseline_manifest_id: "baseline-manifest-repo-ci",
    niche_program_id: "repo-ci-specialist",
    created_at: "2026-03-12T11:50:00.000Z",
    planner_runtime: {
      component_id: "planner-primary-v1",
      provider: "openai",
      model_id: "gpt-5",
      api_mode: "responses",
    },
    provider: "openai",
    model_id: "gpt-5",
    model_snapshot_id: "gpt-5-2026-03-10",
    api_mode: "responses",
    provider_release_label: "gpt-5-2026-03-10",
    api_revision: "v1",
    capability_snapshot_at: "2026-03-12T11:49:00.000Z",
    routing_proxy_version: "2026.3.12",
    provider_metadata_quality: "exact_snapshot",
    provider_runtime_notes: "Pinned baseline metadata.",
    sampling_config: { temperature: 0.2 },
    prompt_asset_version: "2026.3.12",
    grader_set_version: "grader-set-v1",
    benchmark_suite_id: "repo-ci-suite",
    source_access_manifest_id: "source-access-repo-ci",
    retry_policy: { max_attempts: 1 },
    token_budget: { max_input_tokens: 64000 },
    context_budget: { max_context_tokens: 64000 },
    execution_mode: "benchmark",
    notes: "Baseline manifest",
    tool_catalog_version: "2026.3.12",
    tool_allowlist: ["exec", "read"],
    tool_contract_version: "2026.3.12",
    retrieval_config: { policy: "baseline" },
    verifier_config: { policy: "baseline" },
  };
}

function makeActionPolicyRuntime(): PreparedNicheActionPolicyRuntime {
  return {
    allowed_tools: ["exec"],
    required_arguments_by_tool: {
      exec: ["command"],
    },
    max_retry_attempts: 2,
  };
}

describe("prepareNicheRunSeed", () => {
  it("defaults candidate version ids from the candidate manifest", () => {
    const seed = prepareNicheRunSeed({
      manifest_kind: "candidate",
      manifest: makeCandidateManifest(),
      domain_pack: makeDomainPack(),
      source_access_manifest: makeSourceAccessManifest(),
      action_policy_runtime: makeActionPolicyRuntime(),
      verifier_pack_id: "verifier-pack-repo-ci",
      verifier_pack_version: "2026.3.12",
      mode: "benchmark",
      runtime_snapshot_id: "runtime-snapshot-v1",
      context_bundle_id: "context-bundle-v1",
      determinism_policy_id: "determinism-v1",
      random_seed: "seed-1",
      replayability_status: "partially_replayable",
      determinism_notes: "Live benchmark replay is partial.",
      readiness_report_id: "repo-ci-specialist-readiness",
    });

    expect(seed.domain_pack_id).toBe("repo-ci-pack");
    expect(seed.action_policy_version_id).toBe("action-policy-v1");
    expect(seed.verifier_pack_version_id).toBe("verifier-pack-v1");
    expect(seed.retrieval_stack_version_id).toBe("retrieval-stack-v1");
    expect(seed.grader_set_version_id).toBe("grader-set-v1");
    expect(seed.planner_version_id).toBe("planner-primary-v1");
    expect(seed.verifier_pack_config.verifier_pack_id).toBe("verifier-pack-repo-ci");
  });

  it("fails closed when a baseline seed omits explicit version ids", () => {
    expect(() =>
      prepareNicheRunSeed({
        manifest_kind: "baseline",
        manifest: makeBaselineManifest(),
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        action_policy_runtime: makeActionPolicyRuntime(),
        verifier_pack_id: "verifier-pack-repo-ci",
        verifier_pack_version: "2026.3.12",
        mode: "baseline",
        runtime_snapshot_id: "runtime-snapshot-v1",
        context_bundle_id: "context-bundle-v1",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-1",
        replayability_status: "non_replayable",
        determinism_notes: "Local baseline run.",
        readiness_report_id: "repo-ci-specialist-readiness",
      }),
    ).toThrow(/action_policy_version_id is required/u);
  });

  it("fails closed when allowed tools are outside the source-access manifest", () => {
    expect(() =>
      prepareNicheRunSeed({
        manifest_kind: "candidate",
        manifest: makeCandidateManifest(),
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        action_policy_runtime: {
          allowed_tools: ["exec", "apply_patch"],
        },
        verifier_pack_id: "verifier-pack-repo-ci",
        verifier_pack_version: "2026.3.12",
        mode: "candidate",
        runtime_snapshot_id: "runtime-snapshot-v1",
        context_bundle_id: "context-bundle-v1",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-1",
        replayability_status: "non_replayable",
        determinism_notes: "Invalid allowlist.",
        readiness_report_id: "repo-ci-specialist-readiness",
      }),
    ).toThrow(/source_access_manifest\.allowed_tools/u);
  });

  it("fails closed when required argument keys are not allowed tools", () => {
    expect(() =>
      prepareNicheRunSeed({
        manifest_kind: "candidate",
        manifest: makeCandidateManifest(),
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        action_policy_runtime: {
          allowed_tools: ["exec"],
          required_arguments_by_tool: {
            read: ["path"],
          },
        },
        verifier_pack_id: "verifier-pack-repo-ci",
        verifier_pack_version: "2026.3.12",
        mode: "candidate",
        runtime_snapshot_id: "runtime-snapshot-v1",
        context_bundle_id: "context-bundle-v1",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-1",
        replayability_status: "non_replayable",
        determinism_notes: "Invalid required-argument map.",
        readiness_report_id: "repo-ci-specialist-readiness",
      }),
    ).toThrow(/required_arguments_by_tool/u);
  });

  it("requires replay metadata for replayable benchmark and shadow seeds", () => {
    expect(() =>
      prepareNicheRunSeed({
        manifest_kind: "candidate",
        manifest: makeCandidateManifest(),
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        action_policy_runtime: makeActionPolicyRuntime(),
        verifier_pack_id: "verifier-pack-repo-ci",
        verifier_pack_version: "2026.3.12",
        mode: "benchmark",
        runtime_snapshot_id: "runtime-snapshot-v1",
        context_bundle_id: "context-bundle-v1",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-1",
        replayability_status: "replayable",
        determinism_notes: "Missing benchmark replay metadata.",
        readiness_report_id: "repo-ci-specialist-readiness",
      }),
    ).toThrow(/benchmark_suite_id is required/u);
  });

  it("fails closed when readiness_report_id is blank", () => {
    expect(() =>
      prepareNicheRunSeed({
        manifest_kind: "candidate",
        manifest: makeCandidateManifest(),
        domain_pack: makeDomainPack(),
        source_access_manifest: makeSourceAccessManifest(),
        action_policy_runtime: makeActionPolicyRuntime(),
        verifier_pack_id: "verifier-pack-repo-ci",
        verifier_pack_version: "2026.3.12",
        mode: "candidate",
        runtime_snapshot_id: "runtime-snapshot-v1",
        context_bundle_id: "context-bundle-v1",
        determinism_policy_id: "determinism-v1",
        random_seed: "seed-1",
        replayability_status: "non_replayable",
        determinism_notes: "Missing readiness provenance.",
        readiness_report_id: "   ",
      }),
    ).toThrow(/readiness_report_id is required/u);
  });
});
