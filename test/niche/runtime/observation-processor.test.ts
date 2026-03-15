import { afterEach, describe, expect, it, vi } from "vitest";
import {
  annotateToolResult,
  clearAllNicheRunTraceContextsForTest,
  registerPreparedNicheRunTraceContext,
  type ObservationAnnotation,
} from "../../../src/niche/runtime/index.js";
import type { PreparedNicheRunSeed } from "../../../src/niche/schema/index.js";

vi.mock("../../../src/plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => ({
    hasHooks: () => false,
    runNicheLifecycle: async () => {},
  }),
}));

function makeSeed(): PreparedNicheRunSeed {
  return {
    seed_id: "prepared-run-seed-observation",
    prepared_at: "2026-03-14T12:00:00.000Z",
    mode: "benchmark",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-obs",
    readiness_report_id: "obs-specialist-readiness",
    niche_program_id: "obs-specialist",
    domain_pack_id: "obs-pack",
    domain_pack: {
      domain_pack_id: "obs-pack",
      niche_program_id: "obs-specialist",
      version: "2026.3.14",
      ontology: { concepts: [{ id: "api-response", label: "API response" }], relations: [] },
      task_taxonomy: [
        {
          task_family_id: "api-verification",
          label: "API verification",
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
          tool_name: "http_request",
          intent_summary: "Send HTTP requests to APIs.",
          required_arguments: ["url"],
          optional_arguments: ["method", "body"],
          failure_modes: ["timeout", "auth_failure"],
        },
      ],
      evidence_source_registry: [
        {
          source_id: "api-docs",
          source_kind: "repos",
          title: "API Documentation",
          access_pattern: "read",
        },
        {
          source_id: "changelog-feed",
          source_kind: "repos",
          title: "Changelog Feed",
          access_pattern: "read",
        },
      ],
      failure_taxonomy: [
        {
          failure_id: "rate_limit_exceeded",
          label: "Rate limit exceeded",
          description: "The API rate limit has been hit.",
          severity: "high",
          detection_hints: ["429", "rate limit"],
        },
        {
          failure_id: "auth_expired",
          label: "Authentication expired",
          description: "The authentication token has expired.",
          severity: "critical",
          detection_hints: ["401", "token expired", "unauthorized"],
        },
      ],
      verifier_defaults: {
        required_checks: ["evidence_grounding"],
        blocking_failure_ids: ["rate_limit_exceeded"],
        output_requirements: ["grounded_response"],
        escalation_policy: "Escalate low-confidence responses.",
      },
      benchmark_seed_specs: [
        {
          seed_id: "seed-obs-1",
          task_family_id: "api-verification",
          prompt: "Verify the API endpoint returns expected data.",
          source_refs: ["api-docs"],
          pass_conditions: ["grounded_response"],
          hard_fail_conditions: [],
        },
      ],
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-obs",
      allowed_tools: ["http_request"],
      allowed_retrieval_indices: ["api-docs"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace-only",
      network_policy: "deny",
      approval_policy: "never",
    },
    action_policy_runtime: {
      allowed_tools: ["http_request"],
      required_arguments_by_tool: {
        http_request: ["url"],
      },
      max_retry_attempts: 1,
    },
    verifier_pack_config: {
      verifier_pack_id: "verifier-pack-obs",
      version: "2026.3.14",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["rate_limit_exceeded"],
      output_requirements: ["grounded_response"],
      escalation_policy: "Escalate low-confidence responses.",
      min_confidence: 0.6,
      max_allowed_ungrounded_claims: 0,
      require_evidence_bundles: true,
    },
    planner_version_id: "planner-primary-v1",
    action_policy_version_id: "action-policy-v1",
    verifier_pack_version_id: "verifier-pack-v1",
    retrieval_stack_version_id: "retrieval-stack-v1",
    grader_set_version_id: "grader-set-v1",
    runtime_snapshot_id: "runtime-snapshot-v1",
    context_bundle_id: "context-bundle-v1",
    determinism_policy_id: "determinism-v1",
    random_seed: "seed-obs-1",
    replayability_status: "non_replayable",
    determinism_notes: "Observation processor test run.",
    artifact_refs: [],
    evidence_bundle_refs: [],
  };
}

const RUN_ID = "run-observation-test";

afterEach(() => {
  clearAllNicheRunTraceContextsForTest();
});

describe("observation processor", () => {
  it("returns default annotation when no niche run is active", () => {
    const annotation = annotateToolResult("nonexistent-run", "http_request", "some result text");
    expect(annotation).toEqual({
      source_id: null,
      matched_signals: [],
      detected_failures: [],
      domain_relevance: "low",
    } satisfies ObservationAnnotation);
  });

  it("matches signal patterns when resultSummary contains a source_id", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    // "api-docs" is a source_id in the evidence_source_registry
    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "The api-docs contain the endpoint specification.",
    );

    expect(annotation.matched_signals.length).toBeGreaterThan(0);
    expect(annotation.source_id).toBe("api-docs");
    expect(annotation.domain_relevance).toBe("high");
  });

  it("matches multiple signal patterns when resultSummary contains multiple source_ids", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "Checked both api-docs and changelog-feed for version info.",
    );

    expect(annotation.matched_signals).toHaveLength(2);
    // source_id is set to the last matched source
    expect(annotation.source_id).toBe("changelog-feed");
    expect(annotation.domain_relevance).toBe("high");
  });

  it("detects failure indicators when resultSummary contains a detection_hint", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    // "429" and "rate limit" are detection hints for rate_limit_exceeded
    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "Request failed with HTTP 429 Too Many Requests.",
    );

    expect(annotation.detected_failures).toHaveLength(1);
    expect(annotation.detected_failures[0]).toEqual({
      failure_id: "rate_limit_exceeded",
      severity: "high",
    });
    expect(annotation.domain_relevance).toBe("medium");
  });

  it("detects multiple failure indicators", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    // "rate limit" triggers rate_limit_exceeded, "token expired" triggers auth_expired
    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "Hit rate limit then token expired on retry.",
    );

    expect(annotation.detected_failures).toHaveLength(2);
    const failureIds = annotation.detected_failures.map((f) => f.failure_id);
    expect(failureIds).toContain("rate_limit_exceeded");
    expect(failureIds).toContain("auth_expired");
    expect(annotation.domain_relevance).toBe("medium");
  });

  it("sets domain_relevance to high when signals match (even if failures also match)", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    // Contains both a source_id ("api-docs") and a failure hint ("rate limit")
    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "The api-docs endpoint returned a rate limit error.",
    );

    expect(annotation.matched_signals.length).toBeGreaterThan(0);
    expect(annotation.detected_failures.length).toBeGreaterThan(0);
    // Signals take precedence over failures for relevance
    expect(annotation.domain_relevance).toBe("high");
  });

  it("sets domain_relevance to low when neither signals nor failures match", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "Everything completed successfully with no issues.",
    );

    expect(annotation.matched_signals).toHaveLength(0);
    expect(annotation.detected_failures).toHaveLength(0);
    expect(annotation.domain_relevance).toBe("low");
  });

  it("performs case-insensitive matching for signal patterns", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "Found relevant info in API-DOCS section.",
    );

    expect(annotation.matched_signals.length).toBeGreaterThan(0);
    expect(annotation.source_id).toBe("api-docs");
    expect(annotation.domain_relevance).toBe("high");
  });

  it("performs case-insensitive matching for failure indicators", () => {
    registerPreparedNicheRunTraceContext({ runId: RUN_ID, seed: makeSeed() });

    const annotation = annotateToolResult(
      RUN_ID,
      "http_request",
      "Server responded with TOKEN EXPIRED message.",
    );

    expect(annotation.detected_failures).toHaveLength(1);
    expect(annotation.detected_failures[0]!.failure_id).toBe("auth_expired");
    expect(annotation.domain_relevance).toBe("medium");
  });
});
