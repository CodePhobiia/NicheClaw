import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveJsonFile } from "../../../src/infra/json-file.js";
import { writeReadinessReport } from "../../../src/niche/store/index.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

const tempRoots: string[] = [];
const agentCommand = vi.fn();

vi.mock("../../../src/commands/agent.js", () => ({
  agentCommand,
}));

const { nicheRunCommand } = await import("../../../src/commands/niche/run.js");

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-niche-run-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (!dir) {
      continue;
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeSeedFile(dir: string, overrides: Record<string, unknown> = {}): string {
  const seedPath = path.join(dir, "prepared-seed.json");
  saveJsonFile(seedPath, {
    seed_id: "prepared-run-seed-1234",
    prepared_at: "2026-03-12T12:00:00.000Z",
    mode: "candidate",
    manifest_kind: "candidate",
    baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    domain_pack_id: "repo-ci-pack",
    domain_pack: {
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
    },
    source_access_manifest: {
      source_access_manifest_id: "source-access-repo-ci",
      allowed_tools: ["exec"],
      allowed_retrieval_indices: ["repo-doc"],
      allowed_live_sources: [],
      disallowed_sources: [],
      sandbox_policy: "workspace-only",
      network_policy: "deny",
      approval_policy: "never",
    },
    action_policy_runtime: {
      allowed_tools: ["exec"],
      required_arguments_by_tool: {
        exec: ["command"],
      },
    },
    verifier_pack_config: {
      verifier_pack_id: "verifier-pack-repo-ci",
      version: "2026.3.12",
      required_checks: ["evidence_grounding"],
      blocking_failure_ids: ["missing_evidence"],
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
    random_seed: "seed-1",
    replayability_status: "non_replayable",
    determinism_notes: "Explicit local seeded run.",
    artifact_refs: [],
    evidence_bundle_refs: [],
    ...overrides,
  });
  return seedPath;
}

function makeReadinessReport(overrides: Record<string, unknown> = {}) {
  return {
    readiness_report_id: "repo-ci-specialist-readiness",
    niche_program_id: "repo-ci-specialist",
    status: "ready",
    dimension_scores: {
      source_quality: { score: 92, rationale: "Repo sources are clean." },
      source_coverage: { score: 90, rationale: "Coverage is sufficient." },
      contradiction_rate: { score: 8, rationale: "Contradictions are low." },
      freshness: { score: 91, rationale: "Sources are current." },
      rights_sufficiency: { score: 95, rationale: "Rights are approved." },
      task_observability: { score: 94, rationale: "Tool execution is observable." },
      benchmarkability: { score: 93, rationale: "Held-out cases exist." },
      measurable_success_criteria: { score: 89, rationale: "Success is measurable." },
      tool_availability: { score: 96, rationale: "Required tools are available." },
    },
    hard_blockers: [],
    warnings: [],
    recommended_next_actions: [],
    generated_at: "2026-03-12T12:00:00.000Z",
    ...overrides,
  };
}

describe("nicheRunCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentCommand.mockResolvedValue({
      payloads: [{ text: "done", mediaUrl: null }],
      meta: { durationMs: 1 },
    });
  });

  it("reads the prepared seed and delegates to agentCommand", async () => {
    await withTempHome(async () => {
      writeReadinessReport(makeReadinessReport(), process.env);
      const dir = await makeTempDir();
      const seedPath = makeSeedFile(dir);

      await nicheRunCommand({
        seedPath,
        message: "Investigate the benchmark failure",
        sessionId: "session-123",
        thinking: "medium",
        verbose: "on",
        deliver: true,
        replyChannel: "slack",
        replyTo: "#reports",
        bestEffortDeliver: true,
      });

      expect(agentCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Investigate the benchmark failure",
          sessionId: "session-123",
          thinking: "medium",
          verbose: "on",
          deliver: true,
          replyChannel: "slack",
          replyTo: "#reports",
          bestEffortDeliver: true,
          nicheRunSeed: expect.objectContaining({
            seed_id: "prepared-run-seed-1234",
            baseline_or_candidate_manifest_id: "candidate-manifest-repo-ci",
          }),
        }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  it("fails closed when the prepared seed omits readiness_report_id", async () => {
    await withTempHome(async () => {
      const dir = await makeTempDir();
      const seedPath = makeSeedFile(dir, {
        readiness_report_id: undefined,
      });

      await expect(
        nicheRunCommand({
          seedPath,
          message: "Investigate the benchmark failure",
        }),
      ).rejects.toThrow(/readiness_report_id/u);
      expect(agentCommand).not.toHaveBeenCalled();
    });
  });

  it("fails closed when the referenced readiness report is blocked", async () => {
    await withTempHome(async () => {
      writeReadinessReport(
        makeReadinessReport({
          status: "not_ready",
          hard_blockers: [
            {
              blocker_code: "source_coverage_too_low_for_benchmarkable_domain_pack",
              message: "Source coverage is too low to support a benchmarkable domain pack.",
            },
          ],
        }),
        process.env,
      );
      const dir = await makeTempDir();
      const seedPath = makeSeedFile(dir);

      await expect(
        nicheRunCommand({
          seedPath,
          message: "Investigate the benchmark failure",
        }),
      ).rejects.toThrow(/Source coverage is too low/u);
      expect(agentCommand).not.toHaveBeenCalled();
    });
  });

  it("fails closed when the readiness report targets a different niche program", async () => {
    await withTempHome(async () => {
      writeReadinessReport(
        makeReadinessReport({
          niche_program_id: "ops-specialist",
        }),
        process.env,
      );
      const dir = await makeTempDir();
      const seedPath = makeSeedFile(dir);

      await expect(
        nicheRunCommand({
          seedPath,
          message: "Investigate the benchmark failure",
        }),
      ).rejects.toThrow(/targets ops-specialist, expected repo-ci-specialist/u);
      expect(agentCommand).not.toHaveBeenCalled();
    });
  });
});
