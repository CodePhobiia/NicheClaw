import { Command } from "commander";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nichePrepareRunCommand = vi.fn();
const nicheRunCommand = vi.fn();
const nicheCreateCommand = vi.fn();
const nicheCompileCommand = vi.fn();
const nicheReadinessCommand = vi.fn();
const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};

vi.mock("../../commands/niche/benchmark.js", () => ({
  nicheBenchmarkCommand: vi.fn(),
}));

vi.mock("../../commands/niche/compare.js", () => ({
  nicheCompareCommand: vi.fn(),
}));

vi.mock("../../commands/niche/init.js", () => ({
  nicheInitCommand: vi.fn(),
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

vi.mock("../../commands/niche/inspect.js", () => ({
  NICHE_INSPECT_KINDS: [
    "baseline_manifest",
    "candidate_manifest",
    "source_access_manifest",
    "candidate_recipe",
    "artifact",
    "promoted_monitor",
  ],
  nicheInspectCommand: vi.fn(),
}));

vi.mock("../../commands/niche/optimize.js", () => ({
  nicheOptimizeCommand: vi.fn(),
}));

vi.mock("../../commands/niche/prepare-run.js", () => ({
  nichePrepareRunCommand,
}));

vi.mock("../../commands/niche/release.js", () => ({
  nicheReleaseCommand: vi.fn(),
}));

vi.mock("../../commands/niche/run.js", () => ({
  nicheRunCommand,
}));

vi.mock("../../runtime.js", () => ({
  defaultRuntime: runtime,
}));

let registerNicheCommands: typeof import("./register.niche.js").registerNicheCommands;

beforeAll(async () => {
  ({ registerNicheCommands } = await import("./register.niche.js"));
});

describe("registerNicheCommands prepare-run and run", () => {
  async function runCli(args: string[]) {
    const program = new Command();
    registerNicheCommands(program);
    await program.parseAsync(args, { from: "user" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    nicheCreateCommand.mockResolvedValue(undefined);
    nicheCompileCommand.mockResolvedValue(undefined);
    nicheReadinessCommand.mockResolvedValue(undefined);
    nichePrepareRunCommand.mockResolvedValue(undefined);
    nicheRunCommand.mockResolvedValue(undefined);
  });

  it("runs niche prepare-run with the prepared seed inputs", async () => {
    await runCli([
      "niche",
      "prepare-run",
      "--manifest-kind",
      "candidate",
      "--manifest",
      "./candidate.json",
      "--domain-pack",
      "./domain-pack.json",
      "--source-access-manifest",
      "./source-access.json",
      "--action-policy-runtime",
      "./action-policy-runtime.json",
      "--readiness-report",
      "./readiness.json",
      "--verifier-pack-id",
      "verifier-pack-repo-ci",
      "--verifier-pack-version",
      "2026.3.12",
      "--mode",
      "benchmark",
      "--runtime-snapshot-id",
      "runtime-snapshot-v1",
      "--context-bundle-id",
      "context-bundle-v1",
      "--determinism-policy-id",
      "determinism-v1",
      "--random-seed",
      "seed-1",
      "--replayability-status",
      "replayable",
      "--determinism-notes",
      "Frozen benchmark fixture.",
      "--artifact-ref",
      "./artifact-a.json",
      "--artifact-ref",
      "./artifact-b.json",
      "--evidence-bundle",
      "./evidence-a.json",
      "--benchmark-suite-id",
      "repo-ci-suite",
      "--benchmark-arm-id",
      "candidate-arm",
      "--benchmark-case-kind",
      "atomic_case",
      "--benchmark-case-id",
      "eval-case-1",
      "--suite-hash",
      "0123456789abcdef0123456789abcdef",
      "--fixture-version",
      "2026.3.12",
      "--environment-snapshot",
      "./environment.json",
      "--out",
      "./prepared-seed.json",
      "--json",
    ]);

    expect(nichePrepareRunCommand).toHaveBeenCalledWith({
      manifestKind: "candidate",
      manifestPath: "./candidate.json",
      domainPackPath: "./domain-pack.json",
      sourceAccessManifestPath: "./source-access.json",
      actionPolicyRuntimePath: "./action-policy-runtime.json",
      readinessReportPath: "./readiness.json",
      verifierPackId: "verifier-pack-repo-ci",
      verifierPackVersion: "2026.3.12",
      mode: "benchmark",
      runtimeSnapshotId: "runtime-snapshot-v1",
      contextBundleId: "context-bundle-v1",
      determinismPolicyId: "determinism-v1",
      randomSeed: "seed-1",
      replayabilityStatus: "replayable",
      determinismNotes: "Frozen benchmark fixture.",
      plannerVersionId: undefined,
      actionPolicyVersionId: undefined,
      verifierPackVersionId: undefined,
      retrievalStackVersionId: undefined,
      graderSetVersionId: undefined,
      artifactRefPaths: ["./artifact-a.json", "./artifact-b.json"],
      evidenceBundlePaths: ["./evidence-a.json"],
      benchmarkSuiteId: "repo-ci-suite",
      benchmarkArmId: "candidate-arm",
      benchmarkCaseKind: "atomic_case",
      benchmarkCaseId: "eval-case-1",
      suiteHash: "0123456789abcdef0123456789abcdef",
      fixtureVersion: "2026.3.12",
      environmentSnapshotPath: "./environment.json",
      outPath: "./prepared-seed.json",
      json: true,
    });
  });

  it("runs niche run with the local seeded agent options", async () => {
    await runCli([
      "niche",
      "run",
      "--seed",
      "./prepared-seed.json",
      "--message",
      "Investigate the benchmark failure",
      "--session-id",
      "session-123",
      "--thinking",
      "medium",
      "--thinking-once",
      "high",
      "--verbose",
      "on",
      "--deliver",
      "--reply-to",
      "#reports",
      "--reply-channel",
      "slack",
      "--reply-account-id",
      "ops",
      "--thread-id",
      "thread-9",
      "--message-channel",
      "webchat",
      "--channel",
      "slack",
      "--account-id",
      "ops",
      "--best-effort-deliver",
      "--json",
    ]);

    expect(nicheRunCommand).toHaveBeenCalledWith({
      seedPath: "./prepared-seed.json",
      message: "Investigate the benchmark failure",
      agentId: undefined,
      to: undefined,
      sessionId: "session-123",
      sessionKey: undefined,
      thinking: "medium",
      thinkingOnce: "high",
      verbose: "on",
      json: true,
      timeout: undefined,
      deliver: true,
      replyTo: "#reports",
      replyChannel: "slack",
      replyAccountId: "ops",
      threadId: "thread-9",
      messageChannel: "webchat",
      channel: "slack",
      accountId: "ops",
      bestEffortDeliver: true,
    });
  });

  it("documents prepare-run and run in help output", () => {
    const program = new Command();
    registerNicheCommands(program);

    const niche = program.commands.find((command) => command.name() === "niche");
    const help = niche?.helpInformation() ?? "";

    expect(help).toContain("prepare-run");
    expect(help).toContain("run");
    expect(help).toContain("readiness-gated seeded-runtime");
  });
});
