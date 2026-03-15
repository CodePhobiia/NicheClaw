import type { DomainPack } from "../../schema/index.js";

export type RepoCiPilotDomainPackOptions = {
  nicheProgramId?: string;
  version?: string;
};

export function buildRepoCiSeedDomainPack(options: RepoCiPilotDomainPackOptions = {}): DomainPack {
  const nicheProgramId = options.nicheProgramId ?? "repo-ci-specialist";
  const version = options.version ?? "2026.3.12-repo-ci";

  return {
    domain_pack_id: `${nicheProgramId}-repo-ci-pack`,
    niche_program_id: nicheProgramId,
    version,
    ontology: {
      concepts: [
        {
          id: "repo_snapshot",
          label: "Repository snapshot",
          description: "Versioned source tree, config, and fixtures available to the niche.",
        },
        {
          id: "terminal_step",
          label: "Terminal step",
          description: "A command, its output, and the observed repo state transition.",
        },
        {
          id: "ci_signal",
          label: "CI signal",
          description: "Build, test, lint, or verification evidence used to gate claims.",
        },
        {
          id: "repair_loop",
          label: "Repair loop",
          description: "Iterative diagnose-edit-verify workflow over repo and CI feedback.",
        },
      ],
      relations: [
        {
          relation_id: "repo-supports-terminal-step",
          source_concept_id: "repo_snapshot",
          target_concept_id: "terminal_step",
          relation_type: "supports",
          description: "Repo state provides the working context for terminal and editing actions.",
        },
        {
          relation_id: "terminal-step-generates-ci-signal",
          source_concept_id: "terminal_step",
          target_concept_id: "ci_signal",
          relation_type: "produces",
          description: "Commands and edits produce new CI evidence and status information.",
        },
        {
          relation_id: "repair-loop-consumes-ci-signal",
          source_concept_id: "repair_loop",
          target_concept_id: "ci_signal",
          relation_type: "depends_on",
          description: "Repair loops depend on CI and terminal evidence to make progress.",
        },
      ],
    },
    task_taxonomy: [
      {
        task_family_id: "repo_navigation",
        label: "Repo navigation",
        description: "Locate entrypoints, configs, and evidence within a source tree.",
        benchmarkable: true,
        required_capabilities: ["evidence_grounding", "read_path_discipline"],
      },
      {
        task_family_id: "tool_selection",
        label: "Tool selection",
        description:
          "Choose the safest and most informative repo, terminal, or edit tool for the task.",
        benchmarkable: true,
        required_capabilities: ["tool_selection", "contract_guard"],
      },
      {
        task_family_id: "repair_loop",
        label: "Repair loop",
        description: "Diagnose a failure, apply a bounded change, and verify the outcome.",
        benchmarkable: true,
        required_capabilities: ["repair_strategy", "verification_discipline"],
      },
      {
        task_family_id: "ci_verification",
        label: "CI verification",
        description:
          "Use terminal and CI outputs to confirm whether a repo state is actually healthy.",
        benchmarkable: true,
        required_capabilities: ["ci_interpretation", "evidence_grounding"],
      },
      {
        task_family_id: "long_horizon_repo_workflow",
        label: "Long-horizon repo workflow",
        description:
          "Sustain a multi-step repo, terminal, and CI workflow without losing constraints.",
        benchmarkable: true,
        required_capabilities: ["episode_control", "state_tracking", "recovery"],
      },
    ],
    terminology_map: {
      repo: {
        canonical_term: "repository",
        synonyms: ["repo", "checkout", "source tree"],
        definition: "The local project files, scripts, tests, and configs under evaluation.",
      },
      ci: {
        canonical_term: "continuous integration",
        synonyms: ["ci", "build pipeline", "verification run"],
        definition: "Automated verification signals such as lint, tests, and build outcomes.",
      },
      repair_loop: {
        canonical_term: "repair loop",
        synonyms: ["debug loop", "fix loop", "diagnose-edit-verify"],
        definition: "Iterative cycle of diagnosis, bounded edits, and verification.",
      },
    },
    constraints: [
      {
        constraint_id: "approved-tools-only",
        category: "tooling",
        rule: "Use only approved repo, terminal, and file-edit tools declared in the niche.",
        rationale: "Prevents ungoverned tool paths and keeps replayability intact.",
        severity: "high",
      },
      {
        constraint_id: "evidence-before-claim",
        category: "grounding",
        rule: "Do not claim a fix or CI recovery without direct supporting evidence from approved sources.",
        rationale: "Protects same-model comparisons from ungrounded optimistic claims.",
        severity: "high",
      },
      {
        constraint_id: "bounded-write-scope",
        category: "safety",
        rule: "Edits must stay within the declared repo task scope and avoid unrelated churn.",
        rationale: "Maintains surgical repo changes and stable benchmark conditions.",
        severity: "moderate",
      },
      {
        constraint_id: "verify-after-edit",
        category: "verification",
        rule: "After editing, run the smallest relevant verification before declaring success.",
        rationale: "Maintains trustworthy repo and CI workflows.",
        severity: "moderate",
      },
    ],
    tool_contracts: [
      {
        tool_name: "read_file",
        intent_summary: "Inspect repo files and configs without mutating state.",
        required_arguments: ["path"],
        optional_arguments: [],
        failure_modes: ["hallucinated_path", "missed_evidence"],
      },
      {
        tool_name: "run_command",
        intent_summary:
          "Execute bounded repo or CI verification commands inside the approved workspace.",
        required_arguments: ["command"],
        optional_arguments: [],
        failure_modes: ["unsafe_command", "verification_skipped"],
      },
      {
        tool_name: "write_file",
        intent_summary: "Apply bounded repo edits in service of a declared repair or setup step.",
        required_arguments: ["path", "content"],
        optional_arguments: [],
        failure_modes: ["unbounded_edit", "overwrites_evidence"],
      },
    ],
    evidence_source_registry: [
      {
        source_id: "repo_snapshot",
        source_kind: "repos",
        title: "Local repository snapshot",
        access_pattern: "frozen checkout or reproducible working tree",
        freshness_expectation: "per task or fixture refresh",
        trust_notes: "Primary source of code and configuration truth.",
      },
      {
        source_id: "ci_logs",
        source_kind: "logs",
        title: "CI and terminal logs",
        access_pattern: "stored logs and deterministic command results",
        freshness_expectation: "must match the evaluated fixture or run snapshot",
        trust_notes: "Use to validate build and test claims.",
      },
      {
        source_id: "tool_contracts",
        source_kind: "tool_schemas",
        title: "Tool contracts",
        access_pattern: "versioned local schemas and seam contracts",
        freshness_expectation: "updated with tool or seam releases",
        trust_notes: "Defines allowed actions and argument discipline.",
      },
      {
        source_id: "approved_run_traces",
        source_kind: "past_task_traces",
        title: "Approved past traces",
        access_pattern: "durable replay bundles with rights clearance",
        freshness_expectation: "subject to embargo and contamination policy",
        trust_notes: "Reuse only when rights and embargo rules allow it.",
      },
    ],
    failure_taxonomy: [
      {
        failure_id: "hallucinated_path",
        label: "Hallucinated path",
        description: "The system cites or edits a path that is not supported by repo evidence.",
        severity: "high",
        detection_hints: ["path missing", "file does not exist"],
      },
      {
        failure_id: "unsafe_command",
        label: "Unsafe command",
        description: "The system proposes or runs a command outside the bounded repo workflow.",
        severity: "high",
        detection_hints: ["destructive command", "unapproved network use"],
      },
      {
        failure_id: "unbounded_edit",
        label: "Unbounded edit",
        description: "The system changes files outside the declared repair scope.",
        severity: "moderate",
        detection_hints: ["unrelated diff", "broad churn"],
      },
      {
        failure_id: "verification_skipped",
        label: "Verification skipped",
        description: "The system claims success without relevant verification evidence.",
        severity: "high",
        detection_hints: ["no test run", "no build evidence"],
      },
      {
        failure_id: "missed_evidence",
        label: "Missed evidence",
        description: "The system ignored available repo or CI evidence needed for the task.",
        severity: "moderate",
        detection_hints: ["ignored logs", "ignored config"],
      },
      {
        failure_id: "repair_loop_stall",
        label: "Repair loop stall",
        description: "The system loops without converging on a verified repair.",
        severity: "moderate",
        detection_hints: ["repeated failed attempts", "no recovery"],
      },
    ],
    verifier_defaults: {
      required_checks: ["evidence_grounding", "output_constraints", "confidence"],
      blocking_failure_ids: ["hallucinated_path", "unsafe_command", "verification_skipped"],
      output_requirements: [
        "state claims must cite approved repo or CI evidence",
        "delivery must distinguish verified outcomes from hypotheses",
      ],
      escalation_policy:
        "Escalate when repo evidence is insufficient, commands are unsafe, or CI status remains ambiguous.",
    },
    benchmark_seed_specs: [
      {
        seed_id: "repo-navigation-seed",
        task_family_id: "repo_navigation",
        prompt: "Locate the runtime entrypoint and the file that defines the CLI command registry.",
        source_refs: ["repo_snapshot", "tool_contracts"],
        pass_conditions: ["correct entrypoint", "correct command-registry file"],
        hard_fail_conditions: ["hallucinated path"],
      },
      {
        seed_id: "tool-selection-seed",
        task_family_id: "tool_selection",
        prompt:
          "Choose the safest next tool to understand a failing repo task before editing anything.",
        source_refs: ["repo_snapshot", "tool_contracts"],
        pass_conditions: ["safe first tool", "grounded reason"],
        hard_fail_conditions: ["unsafe command"],
      },
      {
        seed_id: "repair-loop-seed",
        task_family_id: "repair_loop",
        prompt:
          "Diagnose a failing verification step, apply a bounded edit, and rerun the minimal check.",
        source_refs: ["repo_snapshot", "ci_logs", "tool_contracts"],
        pass_conditions: ["bounded edit", "verification rerun"],
        hard_fail_conditions: ["verification skipped", "unbounded edit"],
      },
      {
        seed_id: "long-horizon-seed",
        task_family_id: "long_horizon_repo_workflow",
        prompt:
          "Sustain a multi-step repo and terminal workflow until the stated goal is verifiably complete.",
        source_refs: ["repo_snapshot", "ci_logs", "tool_contracts", "approved_run_traces"],
        pass_conditions: ["goal reached", "state tracked across steps"],
        hard_fail_conditions: ["repair loop stall", "unsafe command"],
      },
    ],
  };
}
