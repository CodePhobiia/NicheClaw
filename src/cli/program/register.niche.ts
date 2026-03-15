import type { Command } from "commander";
import { nicheBenchmarkCommand } from "../../commands/niche/benchmark.js";
import { nicheCompareCommand } from "../../commands/niche/compare.js";
import { nicheCompileCommand } from "../../commands/niche/compile.js";
import { nicheCreateCommand } from "../../commands/niche/create.js";
import { nicheExportCommand } from "../../commands/niche/export.js";
import { nicheFeedbackCommand } from "../../commands/niche/feedback.js";
import { nicheGcCommand } from "../../commands/niche/gc.js";
import { nicheImportCommand } from "../../commands/niche/import.js";
import { nicheInitCommand } from "../../commands/niche/init.js";
import { nicheInspectCommand, NICHE_INSPECT_KINDS } from "../../commands/niche/inspect.js";
import { nicheListCommand } from "../../commands/niche/list.js";
import { nicheMonitorCommand } from "../../commands/niche/monitor.js";
import { nicheNextCommand } from "../../commands/niche/next.js";
import { nicheOptimizeCommand } from "../../commands/niche/optimize.js";
import { nichePipelineCommand } from "../../commands/niche/pipeline.js";
import { nichePrepareBenchmarkCommand } from "../../commands/niche/prepare-benchmark.js";
import { nichePrepareReleaseCommand } from "../../commands/niche/prepare-release.js";
import { nichePrepareRunCommand } from "../../commands/niche/prepare-run.js";
import { nicheReadinessCommand } from "../../commands/niche/readiness.js";
import { nicheReleaseCommand } from "../../commands/niche/release.js";
import { nicheRunCommand } from "../../commands/niche/run.js";
import { nicheStatusCommand } from "../../commands/niche/status.js";
import { nicheVerifyCommand } from "../../commands/niche/verify.js";
import type {
  BenchmarkCaseKind,
  PreparedNicheRunSeedManifestKind,
  ReplayabilityStatus,
  RunTraceMode,
} from "../../niche/schema/index.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";
import { collectOption, parsePositiveIntOrUndefined } from "./helpers.js";

function parsePositiveIntOption(value: unknown, flagName: string): number | null | undefined {
  const parsed = parsePositiveIntOrUndefined(value);
  if (value !== undefined && parsed === undefined) {
    defaultRuntime.error(`${flagName} must be a positive integer`);
    defaultRuntime.exit(1);
    return null;
  }
  return parsed;
}

function parseNonNegativeNumberOption(value: unknown, flagName: string): number | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    defaultRuntime.error(`${flagName} must be a non-negative number`);
    defaultRuntime.exit(1);
    return null;
  }
  return parsed;
}

export function registerNicheCommands(program: Command) {
  // Feature flag: skip registration if niche is explicitly disabled
  if (process.env.OPENCLAW_NICHE_DISABLED === "1") {
    return;
  }

  const niche = program
    .command("niche")
    .description("NicheClaw control plane for initialization, benchmarking, and optimizer planning")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          [
            "openclaw niche init --write-starter-program",
            "Initialize the NicheClaw state roots and write a starter niche program.",
          ],
          [
            "openclaw niche create --program ./niche-program.json",
            "Store a validated Niche program as the operator-owned specialization definition.",
          ],
          [
            "openclaw niche compile --niche-program-id repo-ci-specialist --source ./sources/repo.json --source ./sources/seeds.json --json",
            "Normalize source descriptors, persist source-access and readiness state, and compile a system-owned domain pack record.",
          ],
          [
            "openclaw niche readiness --niche-program-id repo-ci-specialist",
            "Read the latest stored readiness report for a Niche program.",
          ],
          [
            'openclaw niche prepare-run --manifest-kind candidate --manifest ./candidate.json --domain-pack ./domain-pack.json --source-access-manifest ./source-access.json --action-policy-runtime ./action-policy-runtime.json --readiness-report ./readiness.json --verifier-pack-id verifier-pack-repo-ci --verifier-pack-version 2026.3.12 --mode benchmark --runtime-snapshot-id runtime-snapshot-v1 --context-bundle-id context-bundle-v1 --determinism-policy-id determinism-v1 --random-seed seed-1 --replayability-status replayable --determinism-notes "Frozen benchmark fixture." --benchmark-suite-id repo-ci-suite --benchmark-arm-id candidate-arm --suite-hash 0123456789abcdef0123456789abcdef --fixture-version 2026.3.12 --environment-snapshot ./environment.json --out ./prepared-seed.json',
            "Prepare a readiness-gated seeded-runtime Niche run seed from typed JSON inputs.",
          ],
          [
            'openclaw niche run --seed ./prepared-seed.json --session-id session-123 --message "Investigate the failing benchmark case" --json',
            "Activate a readiness-gated seeded-runtime Niche run through the local trusted agent path.",
          ],
          [
            "openclaw niche benchmark --live --baseline-manifest ./baseline.json --candidate-manifest ./candidate.json --suite ./suite.json --readiness-report ./readiness.json --json",
            "Execute baseline and candidate through the real runtime path and persist authoritative benchmark evidence.",
          ],
          [
            "openclaw niche optimize --job-type candidate_generation --niche-program-id repo-ci-specialist --readiness-report ./readiness.json --candidate-recipe ./candidate-recipe.json --candidate-recipe-ref ./candidate-recipe-ref.json --preview --json",
            "Preview a governed optimizer job plan without executing it.",
          ],
          [
            "openclaw niche release --baseline-manifest ./baseline.json --candidate-manifest ./candidate.json --benchmark-result ./benchmark-summary.json --verifier-metrics ./verifier-metrics.json --monitor ./promoted-monitor.json --component-artifact-ref ./release-bundle-ref.json --readiness-report ./readiness.json --json",
            "Evaluate release policy and emit a typed promotion decision.",
          ],
          [
            "openclaw niche inspect --kind candidate_manifest --file ./candidate.json",
            "Inspect a niche artifact or manifest without mutating stores.",
          ],
          [
            "openclaw niche compare --baseline-manifest ./baseline.json --candidate-manifest ./candidate.json --suite ./suite.json --benchmark-result ./benchmark-summary.json --monitor ./promoted-monitor.json --verifier-metrics ./verifier-metrics.json",
            "Compare manifests and governance-critical benchmark or release inputs.",
          ],
        ])}`,
    );

  niche
    .command("init")
    .description("Initialize NicheClaw state roots and validate architecture anchors")
    .option("--write-starter-program", "Write a starter niche program manifest", false)
    .option("--starter-program-id <id>", "Starter niche program id")
    .option("--starter-program-name <name>", "Starter niche program name")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheInitCommand({
          writeStarterProgram: Boolean(opts.writeStarterProgram),
          starterProgramId: opts.starterProgramId as string | undefined,
          starterProgramName: opts.starterProgramName as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("create")
    .description("Store a validated Niche program for later compile and release flows")
    .requiredOption("--program <path>", "Path to the Niche program JSON")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheCreateCommand({
          programPath: opts.program as string,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("list")
    .description("List all stored niche programs with their workflow stage")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheListCommand({ json: Boolean(opts.json) });
      });
    });

  niche
    .command("next")
    .description("Show the next action and command for a niche program")
    .requiredOption("--niche-program-id <id>", "Niche program id")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheNextCommand({
          nicheProgramId: opts.nicheProgramId as string,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("pipeline")
    .description("Run multiple niche stages in sequence with automatic artifact bridging")
    .requiredOption("--niche-program-id <id>", "Niche program id")
    .option("--from <stage>", "Start stage: compile | readiness | prepare-benchmark")
    .option("--to <stage>", "End stage: compile | readiness | prepare-benchmark")
    .option(
      "--source <path>",
      "Source descriptor JSON path (repeatable, required for compile)",
      collectOption,
      [],
    )
    .option("--force", "Re-run already-completed stages", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nichePipelineCommand({
          nicheProgramId: opts.nicheProgramId as string,
          from: opts.from as string | undefined,
          to: opts.to as string | undefined,
          sourcePaths: (opts.source as string[]).length > 0 ? (opts.source as string[]) : undefined,
          force: Boolean(opts.force),
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("compile")
    .description(
      "Normalize source descriptors and persist the compiled domain-pack, source-access, and readiness artifacts",
    )
    .requiredOption("--niche-program-id <id>", "Stored niche program id")
    .requiredOption(
      "--source <path>",
      "Source descriptor JSON path (repeatable)",
      collectOption,
      [],
    )
    .option("--version <version>", "Domain-pack version override")
    .option("--compiled-at <timestamp>", "Compilation timestamp override")
    .option(
      "--emit-manifests",
      "Also build and store baseline + candidate manifests from the compilation",
      false,
    )
    .option("--provider <provider>", "Provider override for emitted manifests")
    .option("--model-id <modelId>", "Model ID override for emitted manifests")
    .option("--api-mode <apiMode>", "API mode override for emitted manifests")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheCompileCommand({
          nicheProgramId: opts.nicheProgramId as string,
          sourcePaths: opts.source as string[],
          version: opts.version as string | undefined,
          compiledAt: opts.compiledAt as string | undefined,
          emitManifests: Boolean(opts.emitManifests),
          provider: opts.provider as string | undefined,
          modelId: opts.modelId as string | undefined,
          apiMode: opts.apiMode as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("readiness")
    .description("Read the latest stored readiness report for a niche program")
    .requiredOption("--niche-program-id <id>", "Stored niche program id")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheReadinessCommand({
          nicheProgramId: opts.nicheProgramId as string,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("prepare-run")
    .description("Prepare a readiness-gated seeded-runtime Niche run seed from typed JSON inputs")
    .option(
      "--from-program <id>",
      "Resolve manifest, domain-pack, and source-access paths from a stored niche program",
    )
    .requiredOption("--manifest-kind <kind>", "Manifest kind: baseline | candidate")
    .option(
      "--manifest <path>",
      "Path to the baseline or candidate manifest JSON (required unless --from-program)",
    )
    .option("--domain-pack <path>", "Path to the domain-pack JSON (required unless --from-program)")
    .option(
      "--source-access-manifest <path>",
      "Path to the source-access manifest JSON (required unless --from-program)",
    )
    .requiredOption(
      "--action-policy-runtime <path>",
      "Path to the prepared action-policy runtime JSON",
    )
    .option("--readiness-report <path>", "Path to the readiness report JSON")
    .requiredOption(
      "--verifier-pack-id <id>",
      "Verifier pack id used to build the live verifier config",
    )
    .requiredOption("--verifier-pack-version <version>", "Verifier pack config version")
    .requiredOption("--mode <mode>", "Run mode: baseline | candidate | shadow | benchmark | live")
    .requiredOption("--runtime-snapshot-id <id>", "Runtime snapshot id used by this run")
    .requiredOption("--context-bundle-id <id>", "Context bundle id used by this run")
    .requiredOption("--determinism-policy-id <id>", "Determinism policy id")
    .requiredOption("--random-seed <seed>", "Random seed used by this run")
    .requiredOption(
      "--replayability-status <status>",
      "Replayability status: replayable | partially_replayable | non_replayable",
    )
    .requiredOption("--determinism-notes <text>", "Determinism notes for the prepared run")
    .option("--planner-version-id <id>", "Planner version id override")
    .option("--action-policy-version-id <id>", "Action-policy version id override")
    .option("--verifier-pack-version-id <id>", "Verifier-pack version id override")
    .option("--retrieval-stack-version-id <id>", "Retrieval stack version id override")
    .option("--grader-set-version-id <id>", "Grader set version id override")
    .option("--artifact-ref <path>", "Artifact ref JSON path (repeatable)", collectOption, [])
    .option(
      "--evidence-bundle <path>",
      "Evidence bundle ref JSON path (repeatable)",
      collectOption,
      [],
    )
    .option("--benchmark-suite-id <id>", "Benchmark suite id")
    .option("--benchmark-arm-id <id>", "Benchmark arm id")
    .option("--benchmark-case-kind <kind>", "Benchmark case kind: atomic_case | episode_case")
    .option("--benchmark-case-id <id>", "Benchmark case id")
    .option("--suite-hash <hash>", "Benchmark suite hash")
    .option("--fixture-version <version>", "Benchmark fixture version")
    .option("--environment-snapshot <path>", "Environment snapshot JSON path")
    .option("--out <path>", "Write the prepared run seed JSON to this path")
    .option("--json", "Print the prepared run seed JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nichePrepareRunCommand({
          manifestKind: opts.manifestKind as PreparedNicheRunSeedManifestKind,
          manifestPath: opts.manifest as string | undefined,
          domainPackPath: opts.domainPack as string | undefined,
          sourceAccessManifestPath: opts.sourceAccessManifest as string | undefined,
          actionPolicyRuntimePath: opts.actionPolicyRuntime as string,
          readinessReportPath: opts.readinessReport as string | undefined,
          nicheProgramId: opts.fromProgram as string | undefined,
          verifierPackId: opts.verifierPackId as string,
          verifierPackVersion: opts.verifierPackVersion as string,
          mode: opts.mode as RunTraceMode,
          runtimeSnapshotId: opts.runtimeSnapshotId as string,
          contextBundleId: opts.contextBundleId as string,
          determinismPolicyId: opts.determinismPolicyId as string,
          randomSeed: opts.randomSeed as string,
          replayabilityStatus: opts.replayabilityStatus as ReplayabilityStatus,
          determinismNotes: opts.determinismNotes as string,
          plannerVersionId: opts.plannerVersionId as string | undefined,
          actionPolicyVersionId: opts.actionPolicyVersionId as string | undefined,
          verifierPackVersionId: opts.verifierPackVersionId as string | undefined,
          retrievalStackVersionId: opts.retrievalStackVersionId as string | undefined,
          graderSetVersionId: opts.graderSetVersionId as string | undefined,
          artifactRefPaths: Array.isArray(opts.artifactRef)
            ? (opts.artifactRef as string[])
            : undefined,
          evidenceBundlePaths: Array.isArray(opts.evidenceBundle)
            ? (opts.evidenceBundle as string[])
            : undefined,
          benchmarkSuiteId: opts.benchmarkSuiteId as string | undefined,
          benchmarkArmId: opts.benchmarkArmId as string | undefined,
          benchmarkCaseKind: opts.benchmarkCaseKind as BenchmarkCaseKind | undefined,
          benchmarkCaseId: opts.benchmarkCaseId as string | undefined,
          suiteHash: opts.suiteHash as string | undefined,
          fixtureVersion: opts.fixtureVersion as string | undefined,
          environmentSnapshotPath: opts.environmentSnapshot as string | undefined,
          outPath: opts.out as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("run")
    .description(
      "Activate a readiness-gated seeded-runtime Niche run through the local trusted agent path",
    )
    .requiredOption("--seed <path>", "Path to the prepared Niche run seed JSON")
    .requiredOption("--message <text>", "Message body for the seeded agent run")
    .option("--agent <id>", "Agent id override")
    .option("--to <number>", "Recipient number in E.164 used to derive the session key")
    .option("--session-id <id>", "Use an explicit session id")
    .option("--session-key <key>", "Use an explicit session key")
    .option("--thinking <level>", "Thinking level override")
    .option("--thinking-once <level>", "One-shot thinking level override")
    .option("--verbose <on|off>", "Persist agent verbose level for the session")
    .option("--json", "Output result as JSON", false)
    .option("--timeout <seconds>", "Override agent command timeout in seconds")
    .option("--deliver", "Send the agent reply back to the selected channel", false)
    .option("--reply-to <target>", "Delivery target override")
    .option("--reply-channel <channel>", "Delivery channel override")
    .option("--reply-account-id <id>", "Delivery account id override")
    .option("--thread-id <id>", "Delivery thread/topic id override")
    .option("--message-channel <channel>", "Message channel context")
    .option("--channel <channel>", "Delivery channel")
    .option("--account-id <id>", "Account id for multi-account routing")
    .option("--best-effort-deliver", "Do not throw when delivery fails", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheRunCommand({
          seedPath: opts.seed as string,
          message: opts.message as string,
          agentId: opts.agent as string | undefined,
          to: opts.to as string | undefined,
          sessionId: opts.sessionId as string | undefined,
          sessionKey: opts.sessionKey as string | undefined,
          thinking: opts.thinking as string | undefined,
          thinkingOnce: opts.thinkingOnce as string | undefined,
          verbose: opts.verbose as string | undefined,
          json: Boolean(opts.json),
          timeout: opts.timeout as string | undefined,
          deliver: Boolean(opts.deliver),
          replyTo: opts.replyTo as string | undefined,
          replyChannel: opts.replyChannel as string | undefined,
          replyAccountId: opts.replyAccountId as string | undefined,
          threadId: opts.threadId as string | undefined,
          messageChannel: opts.messageChannel as string | undefined,
          channel: opts.channel as string | undefined,
          accountId: opts.accountId as string | undefined,
          bestEffortDeliver: Boolean(opts.bestEffortDeliver),
        });
      });
    });

  niche
    .command("prepare-benchmark")
    .description(
      "Auto-generate benchmark artifacts (manifests, suite, release inputs) from a compilation record",
    )
    .requiredOption("--niche-program-id <id>", "Stored niche program id")
    .option("--provider <provider>", "Provider override for manifests")
    .option("--model-id <modelId>", "Model ID override for manifests")
    .option("--api-mode <apiMode>", "API mode override for manifests")
    .option("--suite-id <suiteId>", "Benchmark suite ID override")
    .option("--suite-version <version>", "Benchmark suite version override")
    .option("--fixture-version <version>", "Fixture version override")
    .option(
      "--emit-release-artifacts",
      "Also generate starter verifier metrics, monitor definition, and component artifact refs",
      false,
    )
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nichePrepareBenchmarkCommand({
          nicheProgramId: opts.nicheProgramId as string,
          provider: opts.provider as string | undefined,
          modelId: opts.modelId as string | undefined,
          apiMode: opts.apiMode as string | undefined,
          suiteId: opts.suiteId as string | undefined,
          suiteVersion: opts.suiteVersion as string | undefined,
          fixtureVersion: opts.fixtureVersion as string | undefined,
          emitReleaseArtifacts: Boolean(opts.emitReleaseArtifacts),
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("prepare-release")
    .description(
      "Auto-generate release artifacts (verifier metrics, monitor definition, artifact refs) from benchmark results",
    )
    .requiredOption("--niche-program-id <id>", "Stored niche program id")
    .option("--benchmark-result <path>", "Explicit benchmark result record path")
    .option("--baseline-manifest-id <id>", "Explicit baseline manifest id")
    .option("--candidate-manifest-id <id>", "Explicit candidate manifest id")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nichePrepareReleaseCommand({
          nicheProgramId: opts.nicheProgramId as string,
          benchmarkResultPath: opts.benchmarkResult as string | undefined,
          baselineManifestId: opts.baselineManifestId as string | undefined,
          candidateManifestId: opts.candidateManifestId as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("benchmark")
    .description("Run live or typed benchmark comparisons and persist benchmark result records")
    .option(
      "--from-program <id>",
      "Resolve manifest and readiness paths from a stored niche program",
    )
    .option(
      "--baseline-manifest <path>",
      "Path to the baseline manifest JSON (required unless --from-program)",
    )
    .option(
      "--candidate-manifest <path>",
      "Path to the candidate manifest JSON (required unless --from-program)",
    )
    .requiredOption("--suite <path>", "Path to the benchmark suite JSON")
    .option("--baseline-execution <path>", "Path to the baseline typed execution bundle JSON")
    .option("--candidate-execution <path>", "Path to the candidate typed execution bundle JSON")
    .option("--live", "Execute the benchmark through the real runtime path", false)
    .option("--readiness-report <path>", "Path to the readiness report JSON")
    .option("--bootstrap-seed <n>", "Bootstrap seed for deterministic confidence intervals")
    .option("--contamination-detected", "Mark the benchmark input as contaminated", false)
    .option("--actual-suite-hash <hash>", "Actual suite hash observed at execution time")
    .option(
      "--actual-fixture-version <version>",
      "Actual fixture version observed at execution time",
    )
    .option("--actual-grader-version <id>", "Actual grader version observed at execution time")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const bootstrapSeed = parsePositiveIntOption(opts.bootstrapSeed, "--bootstrap-seed");
      if (bootstrapSeed === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheBenchmarkCommand({
          baselineManifestPath: opts.baselineManifest as string | undefined,
          candidateManifestPath: opts.candidateManifest as string | undefined,
          suitePath: opts.suite as string,
          baselineExecutionPath: opts.baselineExecution as string | undefined,
          candidateExecutionPath: opts.candidateExecution as string | undefined,
          live: Boolean(opts.live),
          readinessReportPath: opts.readinessReport as string | undefined,
          nicheProgramId: opts.fromProgram as string | undefined,
          bootstrapSeed,
          contaminationDetected: Boolean(opts.contaminationDetected),
          actualSuiteHash: opts.actualSuiteHash as string | undefined,
          actualFixtureVersion: opts.actualFixtureVersion as string | undefined,
          actualGraderVersion: opts.actualGraderVersion as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("optimize")
    .description("Preview typed optimization-plane job plans without executing them")
    .requiredOption(
      "--job-type <type>",
      "Job type: candidate_generation | teacher_rollout | verifier_refresh | evaluation_preparation",
    )
    .requiredOption("--niche-program-id <id>", "Niche program id")
    .option("--readiness-report <path>", "Path to the readiness report JSON")
    .option("--created-at <timestamp>", "ISO timestamp to stamp onto the job")
    .option("--reward-artifact-id <id>", "Reward artifact id (repeatable)", collectOption, [])
    .option("--promotion-eligible", "Apply promotion-eligible governance checks", false)
    .option("--candidate-recipe <path>", "Candidate recipe JSON path")
    .option("--candidate-recipe-ref <path>", "Candidate recipe artifact ref JSON path")
    .option("--teacher-rollout-request <path>", "Teacher rollout request JSON path")
    .option("--verifier-pack-ref <path>", "Verifier-pack artifact ref JSON path")
    .option(
      "--evaluation-input-ref <path>",
      "Evaluation input artifact ref JSON path (repeatable)",
      collectOption,
      [],
    )
    .option(
      "--candidate-artifact-ref <path>",
      "Candidate artifact ref JSON path (repeatable)",
      collectOption,
      [],
    )
    .option(
      "--benchmark-input-ref <path>",
      "Benchmark input artifact ref JSON path (repeatable)",
      collectOption,
      [],
    )
    .option("--preview", "Alias for the default preview-only behavior", false)
    .option("--execute", "Execute the planned job instead of preview only", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheOptimizeCommand({
          jobType: opts.jobType as string,
          nicheProgramId: opts.nicheProgramId as string,
          readinessReportPath: opts.readinessReport as string | undefined,
          createdAt: opts.createdAt as string | undefined,
          rewardArtifactIds: Array.isArray(opts.rewardArtifactId)
            ? (opts.rewardArtifactId as string[])
            : undefined,
          promotionEligible: Boolean(opts.promotionEligible),
          candidateRecipePath: opts.candidateRecipe as string | undefined,
          candidateRecipeRefPath: opts.candidateRecipeRef as string | undefined,
          teacherRolloutRequestPath: opts.teacherRolloutRequest as string | undefined,
          verifierPackRefPath: opts.verifierPackRef as string | undefined,
          evaluationInputRefPaths: Array.isArray(opts.evaluationInputRef)
            ? (opts.evaluationInputRef as string[])
            : undefined,
          candidateArtifactRefPaths: Array.isArray(opts.candidateArtifactRef)
            ? (opts.candidateArtifactRef as string[])
            : undefined,
          benchmarkInputRefPaths: Array.isArray(opts.benchmarkInputRef)
            ? (opts.benchmarkInputRef as string[])
            : undefined,
          execute: Boolean(opts.execute),
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("release")
    .description("Evaluate release policy inputs and emit a typed promotion decision")
    .option(
      "--from-program <id>",
      "Resolve manifest, benchmark, and readiness paths from a stored niche program",
    )
    .option(
      "--baseline-manifest <path>",
      "Path to the baseline manifest JSON (required unless --from-program)",
    )
    .option(
      "--candidate-manifest <path>",
      "Path to the candidate manifest JSON (required unless --from-program)",
    )
    .option(
      "--benchmark-result <path>",
      "Benchmark result record JSON path (repeatable, required unless --from-program)",
      collectOption,
      [],
    )
    .option(
      "--shadow-result <path>",
      "Shadow benchmark result record JSON path (repeatable)",
      collectOption,
      [],
    )
    .requiredOption("--verifier-metrics <path>", "Verifier metric summary JSON path")
    .requiredOption("--monitor <path>", "Promoted monitor definition JSON path")
    .option("--readiness-report <path>", "Path to the readiness report JSON")
    .requiredOption(
      "--component-artifact-ref <path>",
      "Component artifact ref JSON path (repeatable)",
      collectOption,
      [],
    )
    .option("--approved-by <actor>", "Approver id (repeatable)", collectOption, [])
    .option("--candidate-release-id <id>", "Candidate release id override")
    .option("--baseline-release-id <id>", "Baseline release id override")
    .option("--rollback-target <id>", "Rollback target id override")
    .option("--latency-regression <delta>", "Latency regression delta (fractional, non-negative)")
    .option("--cost-regression <delta>", "Cost regression delta (fractional, non-negative)")
    .option("--monitor-observation <path>", "Optional promoted monitor observation JSON path")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const latencyRegression = parseNonNegativeNumberOption(
        opts.latencyRegression,
        "--latency-regression",
      );
      if (latencyRegression === null) {
        return;
      }
      const costRegression = parseNonNegativeNumberOption(opts.costRegression, "--cost-regression");
      if (costRegression === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheReleaseCommand({
          baselineManifestPath: opts.baselineManifest as string | undefined,
          candidateManifestPath: opts.candidateManifest as string | undefined,
          benchmarkResultPaths: (opts.benchmarkResult as string[]) ?? [],
          shadowResultPaths: opts.shadowResult as string[] | undefined,
          verifierMetricsPath: opts.verifierMetrics as string,
          monitorDefinitionPath: opts.monitor as string,
          componentArtifactRefPaths: opts.componentArtifactRef as string[],
          readinessReportPath: opts.readinessReport as string | undefined,
          nicheProgramId: opts.fromProgram as string | undefined,
          candidateReleaseId: opts.candidateReleaseId as string | undefined,
          baselineReleaseId: opts.baselineReleaseId as string | undefined,
          rollbackTarget: opts.rollbackTarget as string | undefined,
          approvedBy: opts.approvedBy as string[] | undefined,
          latencyRegression,
          costRegression,
          monitorObservationPath: opts.monitorObservation as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("monitor")
    .description("Run a promoted-release monitor assessment cycle (once or on a repeating interval)")
    .requiredOption("--active-stack-id <id>", "Active stack id to monitor")
    .requiredOption("--agent-id <id>", "Agent id")
    .requiredOption("--niche-program-id <id>", "Niche program id")
    .requiredOption("--monitor-definition-path <path>", "Promoted monitor definition JSON path")
    .option("--interval <seconds>", "Repeat interval in seconds (0 = run once)", "0")
    .option("--rollback-target <id>", "Rollback target id override")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const interval = parseNonNegativeNumberOption(opts.interval, "--interval");
      if (interval === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheMonitorCommand({
          activeStackId: opts.activeStackId as string,
          agentId: opts.agentId as string,
          nicheProgramId: opts.nicheProgramId as string,
          monitorDefinitionPath: opts.monitorDefinitionPath as string,
          interval: interval ?? 0,
          rollbackTarget: opts.rollbackTarget as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("inspect")
    .description(
      "Inspect a niche manifest, recipe, artifact, or promoted monitor in a typed read-only view",
    )
    .requiredOption("--kind <kind>", `Inspect kind: ${NICHE_INSPECT_KINDS.join(" | ")}`)
    .requiredOption("--file <path>", "Path to the JSON file to inspect")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheInspectCommand({
          kind: opts.kind as string,
          filePath: opts.file as string,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("compare")
    .description(
      "Read-only comparison of baseline and candidate niche manifests plus governance inputs",
    )
    .requiredOption("--baseline-manifest <path>", "Path to the baseline manifest JSON")
    .requiredOption("--candidate-manifest <path>", "Path to the candidate manifest JSON")
    .option(
      "--suite <path>",
      "Optional benchmark suite JSON path for suite hash and fixture metadata",
    )
    .option(
      "--benchmark-result <path>",
      "Benchmark result record JSON path (repeatable)",
      collectOption,
      [],
    )
    .option(
      "--shadow-result <path>",
      "Shadow benchmark result record JSON path (repeatable)",
      collectOption,
      [],
    )
    .option("--verifier-metrics <path>", "Verifier metric summary JSON path")
    .option("--monitor <path>", "Promoted monitor definition JSON path")
    .option("--latency-regression <delta>", "Latency regression delta (fractional, non-negative)")
    .option("--cost-regression <delta>", "Cost regression delta (fractional, non-negative)")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const latencyRegression = parseNonNegativeNumberOption(
        opts.latencyRegression,
        "--latency-regression",
      );
      if (latencyRegression === null) {
        return;
      }
      const costRegression = parseNonNegativeNumberOption(opts.costRegression, "--cost-regression");
      if (costRegression === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheCompareCommand({
          baselineManifestPath: opts.baselineManifest as string,
          candidateManifestPath: opts.candidateManifest as string,
          suitePath: opts.suite as string | undefined,
          benchmarkResultPaths: opts.benchmarkResult as string[] | undefined,
          shadowResultPaths: opts.shadowResult as string[] | undefined,
          verifierMetricsPath: opts.verifierMetrics as string | undefined,
          monitorDefinitionPath: opts.monitor as string | undefined,
          latencyRegression,
          costRegression,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("export")
    .description("Export niche programs and artifacts as a portable bundle")
    .requiredOption(
      "--niche-program-id <id>",
      "Niche program id to export (repeatable)",
      collectOption,
      [],
    )
    .requiredOption("--out <path>", "Output directory for the export bundle")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheExportCommand({
          nicheProgramIds: opts.nicheProgramId as string[],
          out: opts.out as string,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("import")
    .description("Import niche programs and artifacts from a portable bundle")
    .requiredOption("--bundle <path>", "Path to the export bundle directory")
    .option("--dry-run", "Preview what would be imported without writing", false)
    .option("--force", "Overwrite existing artifacts on conflict", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheImportCommand({
          bundleDir: opts.bundle as string,
          dryRun: Boolean(opts.dryRun),
          force: Boolean(opts.force),
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("gc")
    .description("Garbage collect unreferenced niche artifacts")
    .option("--execute", "Actually delete files (default is dry-run)", false)
    .option("--keep-last <n>", "Keep the last N versions per artifact type (default 3)")
    .option("--keep-days <n>", "Keep anything created within the last N days (default 30)")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const keepLast = parsePositiveIntOption(opts.keepLast, "--keep-last");
      if (keepLast === null) return;
      const keepDays = parsePositiveIntOption(opts.keepDays, "--keep-days");
      if (keepDays === null) return;
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheGcCommand({
          execute: Boolean(opts.execute),
          keepLast: keepLast ?? undefined,
          keepDays: keepDays ?? undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("status")
    .description("Show a dashboard of all niche programs and their lifecycle state")
    .option("--niche-program-id <id>", "Filter to a single niche program")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheStatusCommand({
          nicheProgramId: opts.nicheProgramId as string | undefined,
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("verify")
    .description("Check store integrity: validate JSON files and detect orphan .tmp/.lock files")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheVerifyCommand({ json: Boolean(opts.json) });
      });
    });

  niche
    .command("feedback")
    .description("Submit or view operator feedback for a niche program stage")
    .option("--niche-program-id <id>", "Niche program id")
    .option(
      "--stage <stage>",
      "Pipeline stage: quickstart | compile | readiness | benchmark | release | run",
    )
    .option("--rating <n>", "Rating from 1 to 5")
    .option("--comment <text>", "Optional comment")
    .option("--list", "List all collected feedback", false)
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheFeedbackCommand({
          nicheProgramId: opts.nicheProgramId as string | undefined,
          stage: opts.stage as string | undefined,
          rating: opts.rating ? parseInt(opts.rating as string, 10) : undefined,
          comment: opts.comment as string | undefined,
          list: Boolean(opts.list),
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("quickstart")
    .description("Interactive guided setup for a new NicheClaw specialization")
    .option("--json", "Output JSON summary", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { nicheQuickstartCommand } = await import("../../commands/niche/quickstart.js");
        await nicheQuickstartCommand({ json: Boolean(opts.json) });
      });
    });

  program
    .command("nicheclaw")
    .description("Alias for openclaw niche — NicheClaw Governed AI Agent Specialization")
    .action(() => {
      niche.outputHelp();
    });
}
