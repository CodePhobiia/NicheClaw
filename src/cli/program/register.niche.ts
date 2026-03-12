import type { Command } from "commander";
import { nicheBenchmarkCommand } from "../../commands/niche/benchmark.js";
import { nicheCompareCommand } from "../../commands/niche/compare.js";
import { nicheInitCommand } from "../../commands/niche/init.js";
import { nicheInspectCommand, NICHE_INSPECT_KINDS } from "../../commands/niche/inspect.js";
import { nicheOptimizeCommand } from "../../commands/niche/optimize.js";
import { nicheReleaseCommand } from "../../commands/niche/release.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { formatHelpExamples } from "../help-format.js";
import { collectOption, parsePositiveIntOrUndefined } from "./helpers.js";

function parsePositiveIntOption(
  value: unknown,
  flagName: string,
): number | null | undefined {
  const parsed = parsePositiveIntOrUndefined(value);
  if (value !== undefined && parsed === undefined) {
    defaultRuntime.error(`${flagName} must be a positive integer`);
    defaultRuntime.exit(1);
    return null;
  }
  return parsed;
}

function parseNonNegativeNumberOption(
  value: unknown,
  flagName: string,
): number | null | undefined {
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
            "openclaw niche benchmark --baseline-manifest ./baseline.json --candidate-manifest ./candidate.json --suite ./suite.json --baseline-execution ./baseline-results.json --candidate-execution ./candidate-results.json --json",
            "Run a typed same-model benchmark from manifest and execution bundles.",
          ],
          [
            "openclaw niche optimize --job-type candidate_generation --niche-program-id repo-ci-specialist --candidate-recipe ./candidate-recipe.json --candidate-recipe-ref ./candidate-recipe-ref.json --preview --json",
            "Preview a governed optimizer job plan without executing it.",
          ],
          [
            "openclaw niche release --baseline-manifest ./baseline.json --candidate-manifest ./candidate.json --benchmark-result ./benchmark-summary.json --verifier-metrics ./verifier-metrics.json --monitor ./promoted-monitor.json --component-artifact-ref ./release-bundle-ref.json --json",
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
    .command("benchmark")
    .description("Run an atomic or episode benchmark from typed manifest and execution inputs")
    .requiredOption("--baseline-manifest <path>", "Path to the baseline manifest JSON")
    .requiredOption("--candidate-manifest <path>", "Path to the candidate manifest JSON")
    .requiredOption("--suite <path>", "Path to the benchmark suite JSON")
    .requiredOption("--baseline-execution <path>", "Path to the baseline execution bundle JSON")
    .requiredOption("--candidate-execution <path>", "Path to the candidate execution bundle JSON")
    .option("--bootstrap-seed <n>", "Bootstrap seed for deterministic confidence intervals")
    .option("--contamination-detected", "Mark the benchmark input as contaminated", false)
    .option("--actual-suite-hash <hash>", "Actual suite hash observed at execution time")
    .option("--actual-fixture-version <version>", "Actual fixture version observed at execution time")
    .option("--actual-grader-version <id>", "Actual grader version observed at execution time")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      const bootstrapSeed = parsePositiveIntOption(opts.bootstrapSeed, "--bootstrap-seed");
      if (bootstrapSeed === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheBenchmarkCommand({
          baselineManifestPath: opts.baselineManifest as string,
          candidateManifestPath: opts.candidateManifest as string,
          suitePath: opts.suite as string,
          baselineExecutionPath: opts.baselineExecution as string,
          candidateExecutionPath: opts.candidateExecution as string,
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
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheOptimizeCommand({
          jobType: opts.jobType as string,
          nicheProgramId: opts.nicheProgramId as string,
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
          json: Boolean(opts.json),
        });
      });
    });

  niche
    .command("release")
    .description("Evaluate release policy inputs and emit a typed promotion decision")
    .requiredOption("--baseline-manifest <path>", "Path to the baseline manifest JSON")
    .requiredOption("--candidate-manifest <path>", "Path to the candidate manifest JSON")
    .requiredOption("--benchmark-result <path>", "Benchmark result summary JSON path (repeatable)", collectOption, [])
    .option("--shadow-result <path>", "Shadow benchmark result summary JSON path (repeatable)", collectOption, [])
    .requiredOption("--verifier-metrics <path>", "Verifier metric summary JSON path")
    .requiredOption("--monitor <path>", "Promoted monitor definition JSON path")
    .requiredOption("--component-artifact-ref <path>", "Component artifact ref JSON path (repeatable)", collectOption, [])
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
      const costRegression = parseNonNegativeNumberOption(
        opts.costRegression,
        "--cost-regression",
      );
      if (costRegression === null) {
        return;
      }
      await runCommandWithRuntime(defaultRuntime, async () => {
        await nicheReleaseCommand({
          baselineManifestPath: opts.baselineManifest as string,
          candidateManifestPath: opts.candidateManifest as string,
          benchmarkResultPaths: opts.benchmarkResult as string[],
          shadowResultPaths: opts.shadowResult as string[] | undefined,
          verifierMetricsPath: opts.verifierMetrics as string,
          monitorDefinitionPath: opts.monitor as string,
          componentArtifactRefPaths: opts.componentArtifactRef as string[],
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
    .command("inspect")
    .description("Inspect a niche manifest, recipe, artifact, or promoted monitor in a typed read-only view")
    .requiredOption(
      "--kind <kind>",
      `Inspect kind: ${NICHE_INSPECT_KINDS.join(" | ")}`,
    )
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
    .description("Read-only comparison of baseline and candidate niche manifests plus governance inputs")
    .requiredOption("--baseline-manifest <path>", "Path to the baseline manifest JSON")
    .requiredOption("--candidate-manifest <path>", "Path to the candidate manifest JSON")
    .option("--suite <path>", "Optional benchmark suite JSON path for suite hash and fixture metadata")
    .option("--benchmark-result <path>", "Benchmark result summary JSON path (repeatable)", collectOption, [])
    .option("--shadow-result <path>", "Shadow benchmark result summary JSON path (repeatable)", collectOption, [])
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
      const costRegression = parseNonNegativeNumberOption(
        opts.costRegression,
        "--cost-regression",
      );
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
}
