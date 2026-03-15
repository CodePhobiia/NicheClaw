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

describe("registerNicheCommands inspect and compare", () => {
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

  it("runs niche inspect in read-only mode with typed options", async () => {
    await runCli([
      "niche",
      "inspect",
      "--kind",
      "candidate_manifest",
      "--file",
      "./candidate.json",
      "--json",
    ]);

    expect(nicheInspectCommand).toHaveBeenCalledWith({
      kind: "candidate_manifest",
      filePath: "./candidate.json",
      json: true,
    });
  });

  it("runs niche compare with suite and governance inputs", async () => {
    await runCli([
      "niche",
      "compare",
      "--baseline-manifest",
      "./baseline.json",
      "--candidate-manifest",
      "./candidate.json",
      "--suite",
      "./suite.json",
      "--benchmark-result",
      "./benchmark-1.json",
      "--benchmark-result",
      "./benchmark-2.json",
      "--shadow-result",
      "./shadow-1.json",
      "--verifier-metrics",
      "./verifier-metrics.json",
      "--monitor",
      "./monitor.json",
      "--latency-regression",
      "0.08",
      "--cost-regression",
      "0.04",
      "--json",
    ]);

    expect(nicheCompareCommand).toHaveBeenCalledWith({
      baselineManifestPath: "./baseline.json",
      candidateManifestPath: "./candidate.json",
      suitePath: "./suite.json",
      benchmarkResultPaths: ["./benchmark-1.json", "./benchmark-2.json"],
      shadowResultPaths: ["./shadow-1.json"],
      verifierMetricsPath: "./verifier-metrics.json",
      monitorDefinitionPath: "./monitor.json",
      latencyRegression: 0.08,
      costRegression: 0.04,
      json: true,
    });
  });

  it("rejects invalid compare regressions without invoking the command", async () => {
    await runCli([
      "niche",
      "compare",
      "--baseline-manifest",
      "./baseline.json",
      "--candidate-manifest",
      "./candidate.json",
      "--latency-regression",
      "-1",
    ]);

    expect(runtime.error).toHaveBeenCalledWith(
      "--latency-regression must be a non-negative number",
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(nicheCompareCommand).not.toHaveBeenCalled();
  });

  it("shows inspect and compare in help output", () => {
    const program = new Command();
    registerNicheCommands(program);

    const niche = program.commands.find((command) => command.name() === "niche");
    const help = niche?.helpInformation() ?? "";

    expect(help).toContain("inspect");
    expect(help).toContain("compare");
    expect(help).toContain("read-only");
  });
});
