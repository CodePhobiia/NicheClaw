import { describe, expect, it } from "vitest";
import type { ReplyPayload } from "../../../src/auto-reply/types.js";
import {
  clearAllNicheRunTraceContextsForTest,
  registerNicheRunTraceContext,
  snapshotNicheRunTraceContext,
} from "../../../src/niche/runtime/run-trace-capture.js";
import {
  applyVerifierGate,
  maybeRunNicheVerifierGate,
} from "../../../src/niche/runtime/verifier-gate.js";
import type { DomainPack, SourceAccessManifest } from "../../../src/niche/schema/index.js";
import { createVerifierPackConfig } from "../../../src/niche/verifier/index.js";

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
          description: "Repo policy document.",
        },
      ],
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
        constraint_id: "must-mention-tests",
        category: "output",
        rule: "must_include:tests passed",
        severity: "moderate",
      },
    ],
    tool_contracts: [
      {
        tool_name: "exec",
        intent_summary: "Run commands.",
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
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "missing_evidence",
        label: "Missing evidence",
        description: "Evidence is missing.",
        severity: "high",
        detection_hints: ["unsupported claim"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding", "output_constraints"],
      blocking_failure_ids: ["missing_evidence"],
      output_requirements: ["grounded_response", "must_include:tests passed"],
      escalation_policy: "Escalate low-confidence outputs before delivery.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "seed-1",
        task_family_id: "repo-ci-verification",
        prompt: "Explain verification status.",
        source_refs: ["source-repo-doc"],
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
    allowed_retrieval_indices: ["source-repo-doc"],
    allowed_live_sources: [],
    disallowed_sources: ["source-secret"],
    sandbox_policy: "workspace-only",
    network_policy: "deny",
    approval_policy: "never",
  };
}

function makeReply(text: string): ReplyPayload[] {
  return [{ text }];
}

describe("verifier gate", () => {
  it("approves payloads when the verifier decision is approved", () => {
    const result = applyVerifierGate({
      payloads: makeReply("Tests passed with grounded evidence."),
      decision: {
        decision_id: "decision-1",
        verifier_pack_id: "verifier-pack",
        verifier_pack_version: "2026.3.12",
        run_id: "run-1",
        niche_program_id: "repo-ci-specialist",
        outcome: "approved",
        rationale: "All checks passed.",
        findings: [],
        checked_at: "2026-03-12T12:10:00.000Z",
        evidence_support_ratio: 1,
        effective_confidence: 1,
        confidence_threshold: 0.6,
        latency_added_ms: 10,
        cost_added: 0.01,
      },
    });

    expect(result.action).toBe("deliver");
    expect(result.suppressed_original_output).toBe(false);
    expect(result.delivery_payloads[0]?.text).toBe("Tests passed with grounded evidence.");
  });

  it("vetoes outputs and replaces them with an explicit control message", () => {
    const result = applyVerifierGate({
      payloads: makeReply("Unsafe final answer."),
      decision: {
        decision_id: "decision-2",
        verifier_pack_id: "verifier-pack",
        verifier_pack_version: "2026.3.12",
        run_id: "run-2",
        niche_program_id: "repo-ci-specialist",
        outcome: "vetoed",
        rationale: "Verifier vetoed final delivery.",
        findings: [],
        checked_at: "2026-03-12T12:11:00.000Z",
        evidence_support_ratio: 0,
        effective_confidence: 0,
        confidence_threshold: 0.6,
        latency_added_ms: 10,
        cost_added: 0.01,
      },
    });

    expect(result.action).toBe("block");
    expect(result.suppressed_original_output).toBe(true);
    expect(result.delivery_payloads[0]?.text).toContain("vetoed");
    expect(result.delivery_payloads[0]?.isError).toBe(true);
  });

  it("requests repair and records the verifier decision for active NicheClaw runs", () => {
    clearAllNicheRunTraceContextsForTest();
    const domainPack = makeDomainPack();
    registerNicheRunTraceContext({
      runId: "run-3",
      nicheProgramId: "repo-ci-specialist",
      domainPackId: "repo-ci-pack",
      baselineOrCandidateManifestId: "candidate-manifest-1",
      domainPack,
      sourceAccessManifest: makeSourceAccessManifest(),
      evidenceBundleRefs: [
        {
          evidence_bundle_id: "bundle-1",
          source_refs: [
            {
              source_id: "source-repo-doc",
              source_hash_or_ref: "sha256:bundle-1",
            },
          ],
          retrieval_query: "repo ci verification",
          reranker_output: ["source-repo-doc"],
          delivered_evidence: [
            "Repo policy document requires tests passed evidence before delivery.",
          ],
        },
      ],
      verifierPackConfig: createVerifierPackConfig({
        verifierPackId: "verifier-pack-repo-ci",
        version: "2026.3.12",
        domainPack,
      }),
      actionPolicy: {
        allowedTools: ["exec"],
      },
    });

    const result = maybeRunNicheVerifierGate({
      runId: "run-3",
      payloads: makeReply("Repo policy document requires verification before delivery."),
      checkedAt: "2026-03-12T12:12:00.000Z",
    });

    expect(result?.action).toBe("repair");
    expect(result?.delivery_payloads[0]?.text).toContain("requested repair");
    expect(snapshotNicheRunTraceContext("run-3")?.verifierDecisions).toHaveLength(1);
  });

  it("leaves standard OpenClaw outputs unchanged when NicheClaw verifier context is inactive", () => {
    clearAllNicheRunTraceContextsForTest();
    const result = maybeRunNicheVerifierGate({
      runId: "run-without-niche",
      payloads: makeReply("Standard OpenClaw output."),
      checkedAt: "2026-03-12T12:13:00.000Z",
    });

    expect(result).toBeNull();
    expect(snapshotNicheRunTraceContext("run-without-niche")).toBeUndefined();
  });
});
