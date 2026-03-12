import { Command } from "commander";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nicheInitCommand = vi.fn();
const nicheBenchmarkCommand = vi.fn();
const nicheOptimizeCommand = vi.fn();
const nicheReleaseCommand = vi.fn();
const nicheInspectCommand = vi.fn();
const nicheCompareCommand = vi.fn();

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

vi.mock("../../commands/niche/init.js", () => ({
  nicheInitCommand,
}));

vi.mock("../../commands/niche/benchmark.js", () => ({
  nicheBenchmarkCommand,
}));

vi.mock("../../commands/niche/optimize.js", () => ({
  nicheOptimizeCommand,
}));

vi.mock("../../commands/niche/release.js", () => ({
  nicheReleaseCommand,
}));

vi.mock("../../commands/niche/inspect.js", () => ({
  NICHE_INSPECT_KINDS: [
    "baseline_manifest",
    "candidate_manifest",
    "source_access_manifest",
    "candidate_recipe",
    "artifact",
    "promoted_monitor",
  ],
  nicheInspectCommand,
}));

vi.mock("../../commands/niche/compare.js", () => ({
  nicheCompareCommand,
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: runtime,
}));

let registerNicheCommands: typeof import("./register.niche.js").registerNicheCommands;

beforeAll(async () => {
  ({ registerNicheCommands } = await import("./register.niche.js"));
});

describe("registerNicheCommands", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerNicheCommands(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    nicheInitCommand.mockResolvedValue(undefined);
    nicheBenchmarkCommand.mockResolvedValue(undefined);
    nicheOptimizeCommand.mockResolvedValue(undefined);
    nicheReleaseCommand.mockResolvedValue(undefined);
    nicheInspectCommand.mockResolvedValue(undefined);
    nicheCompareCommand.mockResolvedValue(undefined);
  });

  it("runs niche init with starter program options", async () => {
    await runCli([
      "niche",
      "init",
      "--write-starter-program",
      "--starter-program-id",
      "repo-ci-specialist",
      "--starter-program-name",
      "Repo CI",
      "--json",
    ]);

    expect(nicheInitCommand).toHaveBeenCalledWith({
      writeStarterProgram: true,
      starterProgramId: "repo-ci-specialist",
      starterProgramName: "Repo CI",
      json: true,
    });
  });

  it("runs niche benchmark with parsed benchmark options", async () => {
    await runCli([
      "niche",
      "benchmark",
      "--baseline-manifest",
      "./baseline.json",
      "--candidate-manifest",
      "./candidate.json",
      "--suite",
      "./suite.json",
      "--baseline-execution",
      "./baseline-results.json",
      "--candidate-execution",
      "./candidate-results.json",
      "--bootstrap-seed",
      "7",
      "--contamination-detected",
      "--actual-suite-hash",
      "abc123",
      "--actual-fixture-version",
      "fixture-v2",
      "--actual-grader-version",
      "grader-v3",
      "--json",
    ]);

    expect(nicheBenchmarkCommand).toHaveBeenCalledWith({
      baselineManifestPath: "./baseline.json",
      candidateManifestPath: "./candidate.json",
      suitePath: "./suite.json",
      baselineExecutionPath: "./baseline-results.json",
      candidateExecutionPath: "./candidate-results.json",
      bootstrapSeed: 7,
      contaminationDetected: true,
      actualSuiteHash: "abc123",
      actualFixtureVersion: "fixture-v2",
      actualGraderVersion: "grader-v3",
      json: true,
    });
  });

  it("rejects invalid benchmark seed before invoking the command", async () => {
    await runCli([
      "niche",
      "benchmark",
      "--baseline-manifest",
      "./baseline.json",
      "--candidate-manifest",
      "./candidate.json",
      "--suite",
      "./suite.json",
      "--baseline-execution",
      "./baseline-results.json",
      "--candidate-execution",
      "./candidate-results.json",
      "--bootstrap-seed",
      "0",
    ]);

    expect(runtime.error).toHaveBeenCalledWith("--bootstrap-seed must be a positive integer");
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(nicheBenchmarkCommand).not.toHaveBeenCalled();
  });

  it("runs niche optimize with collected optimizer inputs", async () => {
    await runCli([
      "niche",
      "optimize",
      "--job-type",
      "evaluation-preparation",
      "--niche-program-id",
      "repo-ci-specialist",
      "--reward-artifact-id",
      "reward-a",
      "--reward-artifact-id",
      "reward-b",
      "--candidate-artifact-ref",
      "./candidate-a.json",
      "--candidate-artifact-ref",
      "./candidate-b.json",
      "--benchmark-input-ref",
      "./benchmark-a.json",
      "--promotion-eligible",
      "--preview",
      "--json",
    ]);

    expect(nicheOptimizeCommand).toHaveBeenCalledWith({
      jobType: "evaluation-preparation",
      nicheProgramId: "repo-ci-specialist",
      createdAt: undefined,
      rewardArtifactIds: ["reward-a", "reward-b"],
      promotionEligible: true,
      candidateRecipePath: undefined,
      candidateRecipeRefPath: undefined,
      teacherRolloutRequestPath: undefined,
      verifierPackRefPath: undefined,
      evaluationInputRefPaths: [],
      candidateArtifactRefPaths: ["./candidate-a.json", "./candidate-b.json"],
      benchmarkInputRefPaths: ["./benchmark-a.json"],
      json: true,
    });
  });

  it("documents init, benchmark, and optimize in help output", () => {
    const program = new Command();
    registerNicheCommands(program);

    const niche = program.commands.find((command) => command.name() === "niche");
    const help = niche?.helpInformation() ?? "";

    expect(help).toContain("init");
    expect(help).toContain("benchmark");
    expect(help).toContain("optimize");
    expect(help).toContain("release");
  });
});
