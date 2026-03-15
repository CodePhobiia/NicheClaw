import { Command } from "commander";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nicheInitCommand = vi.fn();
const nicheCreateCommand = vi.fn();
const nicheCompileCommand = vi.fn();
const nicheReadinessCommand = vi.fn();
const nichePrepareRunCommand = vi.fn();
const nicheRunCommand = vi.fn();
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

vi.mock("../../commands/niche/create.js", () => ({
  nicheCreateCommand,
}));

vi.mock("../../commands/niche/compile.js", () => ({
  nicheCompileCommand,
}));

vi.mock("../../commands/niche/readiness.js", () => ({
  nicheReadinessCommand,
}));

vi.mock("../../commands/niche/prepare-run.js", () => ({
  nichePrepareRunCommand,
}));

vi.mock("../../commands/niche/run.js", () => ({
  nicheRunCommand,
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
    nicheCreateCommand.mockResolvedValue(undefined);
    nicheCompileCommand.mockResolvedValue(undefined);
    nicheReadinessCommand.mockResolvedValue(undefined);
    nichePrepareRunCommand.mockResolvedValue(undefined);
    nicheRunCommand.mockResolvedValue(undefined);
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
      "--readiness-report",
      "./readiness.json",
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
      live: false,
      readinessReportPath: "./readiness.json",
      bootstrapSeed: 7,
      contaminationDetected: true,
      actualSuiteHash: "abc123",
      actualFixtureVersion: "fixture-v2",
      actualGraderVersion: "grader-v3",
      json: true,
    });
  });

  it("runs niche benchmark live without typed execution bundles", async () => {
    await runCli([
      "niche",
      "benchmark",
      "--live",
      "--baseline-manifest",
      "./baseline.json",
      "--candidate-manifest",
      "./candidate.json",
      "--suite",
      "./suite.json",
      "--readiness-report",
      "./readiness.json",
      "--json",
    ]);

    expect(nicheBenchmarkCommand).toHaveBeenCalledWith({
      baselineManifestPath: "./baseline.json",
      candidateManifestPath: "./candidate.json",
      suitePath: "./suite.json",
      baselineExecutionPath: undefined,
      candidateExecutionPath: undefined,
      live: true,
      readinessReportPath: "./readiness.json",
      bootstrapSeed: undefined,
      contaminationDetected: false,
      actualSuiteHash: undefined,
      actualFixtureVersion: undefined,
      actualGraderVersion: undefined,
      json: true,
    });
  });

  it("runs niche create with the stored program input", async () => {
    await runCli(["niche", "create", "--program", "./niche-program.json", "--json"]);

    expect(nicheCreateCommand).toHaveBeenCalledWith({
      programPath: "./niche-program.json",
      json: true,
    });
  });

  it("runs niche compile with collected source descriptors", async () => {
    await runCli([
      "niche",
      "compile",
      "--niche-program-id",
      "repo-ci-specialist",
      "--source",
      "./sources/repo.json",
      "--source",
      "./sources/seeds.json",
      "--version",
      "compile-v1",
      "--compiled-at",
      "2026-03-13T10:00:00.000Z",
      "--json",
    ]);

    expect(nicheCompileCommand).toHaveBeenCalledWith({
      nicheProgramId: "repo-ci-specialist",
      sourcePaths: ["./sources/repo.json", "./sources/seeds.json"],
      version: "compile-v1",
      compiledAt: "2026-03-13T10:00:00.000Z",
      emitManifests: false,
      provider: undefined,
      modelId: undefined,
      apiMode: undefined,
      json: true,
    });
  });

  it("runs niche readiness for a stored niche program", async () => {
    await runCli(["niche", "readiness", "--niche-program-id", "repo-ci-specialist", "--json"]);

    expect(nicheReadinessCommand).toHaveBeenCalledWith({
      nicheProgramId: "repo-ci-specialist",
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
      "--readiness-report",
      "./readiness.json",
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
      readinessReportPath: "./readiness.json",
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
      execute: false,
      json: true,
    });
  });

  it("documents init, benchmark, and optimize in help output", () => {
    const program = new Command();
    registerNicheCommands(program);

    const niche = program.commands.find((command) => command.name() === "niche");
    const help = niche?.helpInformation() ?? "";

    expect(help).toContain("init");
    expect(help).toContain("create");
    expect(help).toContain("compile");
    expect(help).toContain("readiness");
    expect(help).toContain("prepare-run");
    expect(help).toContain("run");
    expect(help).toContain("benchmark");
    expect(help).toContain("Run live or typed benchmark comparisons");
    expect(help).toContain("optimize");
    expect(help).toContain("release");
  });
});
