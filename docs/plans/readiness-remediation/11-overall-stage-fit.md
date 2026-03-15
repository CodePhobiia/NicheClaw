# Overall Stage Fit Remediation Plan: 62 to 100

**Dimension:** Overall Stage Fit (Internal Alpha / MVP)
**Current Score:** 62/100
**Target Score:** 100/100
**Stage Bar:** One human operator can complete the full specialization loop on a real niche without developer handholding.

**Premise:** NicheClaw has 18K+ lines of production code and 21K+ lines of tests. Every subsystem is implemented. The runtime is deeply integrated into OpenClaw through 11 seams. The architecture is strong. What is missing is not more code -- it is proof that the product works, an operator path that does not require expert knowledge, and the surrounding artifacts (demo, metrics, rollout plan) that turn an engineering project into a shippable product.

This plan is strategic. It focuses on execution, validation, and communication, not on writing more subsystem code.

---

## SF-01: Execute the Repo/CI Pilot End-to-End on a Real Repository

**Gap:** No human operator has completed the full specialization loop outside of automated tests. The repo-ci pilot has seed data (`src/niche/pilots/repo-ci/seed-domain-pack.ts`, `src/niche/pilots/repo-ci/seed-benchmark-suite.ts`) and E2E tests (`test/niche/e2e/full-pipeline.test.ts`, `test/niche/e2e/specialization-proof.test.ts`), but no evidence of execution against a real repository with real model calls.

**What to do:**

1. Choose a real target repository. The strongest candidate is this repository itself (the OpenClaw fork). Alternative: a small public TypeScript repository with CI, tests, and lintable code.

2. Execute the full CLI loop manually, step by step, with a real provider key (Anthropic or OpenAI):
   - `openclaw niche quickstart` -- interactive setup against the chosen repo
   - `openclaw niche compile` -- compile the domain pack from real repo sources
   - `openclaw niche readiness` -- verify readiness gates
   - `openclaw niche benchmark --live` -- run baseline and candidate through real model inference
   - `openclaw niche release` -- evaluate promotion policy against real benchmark results
   - `openclaw niche compare` -- inspect the baseline vs candidate delta

3. Capture the full transcript of commands, outputs, and timing. Record every error, unexpected behavior, or moment of confusion.

4. Produce a pilot execution log as `docs/niche/pilot-execution-log.md` with: timestamp, every command and its exact flags, every output (truncated if large), pass/fail outcome per stage, and total wall-clock time.

**Success criteria:** A human operator has run the full loop. The execution log exists and is reproducible by a second operator.

**Dependencies:** Working provider API key. The `niche benchmark --live` path (`src/niche/benchmark/live-benchmark.ts`) must reach the real `agentCommand` path via `executePreparedSeedCase`.

**Estimated effort:** 1 full operator session (4-8 hours including troubleshooting).

---

## SF-02: Build a "First Hour" Operator Guide

**Gap:** There is no documentation telling an operator what to do in their first hour with NicheClaw. The `quickstart` command (`src/commands/niche/quickstart.ts`) exists and is interactive, but its "Next Steps" output at lines 441-457 still refers to raw JSON paths and manual flags. An operator who has never seen NicheClaw cannot follow through.

**What to do:**

1. Write `docs/niche/getting-started.md` structured as a timed walkthrough:
   - Minutes 0-5: Prerequisites (Node 22+, pnpm, provider API key, a target repo)
   - Minutes 5-15: `openclaw niche quickstart` with annotated screenshots or terminal output
   - Minutes 15-30: Understanding the readiness report and what "not_ready" vs "ready" means
   - Minutes 30-45: Running a benchmark and reading the result summary
   - Minutes 45-60: Release evaluation and understanding "promoted" vs "rejected"

2. The guide must use the exact CLI commands produced by the pilot execution (SF-01). No hypothetical examples.

3. Include a troubleshooting section covering the most common failure modes discovered during SF-01:
   - Missing provider key
   - Readiness hard blockers (too few sources, missing benchmark seeds)
   - Benchmark contamination warnings
   - Release rejection due to insufficient case count (the default threshold is 100 held-out cases per `NICHECLAW_PRD_V3.md` section 14)

4. Reference the quickstart output directly. If the quickstart command's "Next Steps" note output is insufficient or confusing, file a concrete issue with the exact improvement needed.

**Success criteria:** A second operator (not the pilot operator from SF-01) can follow the guide and complete the loop without asking questions.

**Dependencies:** SF-01 (pilot execution produces the real command transcripts).

**Estimated effort:** 4-6 hours of writing and review.

---

## SF-03: Produce Proof of Lift

**Gap:** NicheClaw's core promise is "measurably better agents." No benchmark result exists that demonstrates this. The E2E test (`test/niche/e2e/full-pipeline.test.ts`) uses synthetic execution results with hardcoded scores. The repo-ci pilot test (`test/niche/pilots/repo-ci.test.ts`) uses stub executors that return fixed scores.

**What to do:**

1. From the pilot execution (SF-01), extract the real benchmark result record. It will be stored at the path returned by `nicheBenchmarkCommand` as `benchmark_result_record_path`.

2. The benchmark result record contains `summary.paired_delta_summary` with `mean_delta`, `confidence_interval_low`, and `confidence_interval_high`. These numbers are the proof of lift (or the honest admission that there is no lift yet).

3. Write `docs/niche/proof-of-lift.md` containing:
   - The benchmark suite used (task families, case count, difficulty distribution)
   - The baseline configuration (provider, model, no niche specialization)
   - The candidate configuration (same provider, same model, with domain pack, action policy, verifier pack)
   - The paired delta summary with confidence intervals
   - The hard-fail rate comparison
   - The latency and cost comparison
   - A plain-language interpretation: "The specialized agent scored X% higher on task success with Y% confidence"

4. If the pilot does not achieve measurable lift, document this honestly. State what the candidate did differently, why lift was insufficient, and what changes to the domain pack, verifier configuration, or benchmark cases would be needed. This honest documentation is itself proof of product maturity.

5. The minimum bar for a compelling proof is not a large delta. It is that the measurement was done correctly: same model, held-out cases, no contamination, with confidence intervals.

**Success criteria:** A proof-of-lift document exists with real numbers from real model execution. Reviewers can independently verify the result by re-running the benchmark with the same seed.

**Dependencies:** SF-01 (produces the real benchmark result).

**Estimated effort:** 2-4 hours.

---

## SF-04: Add Operator Feedback Collection Mechanism

**Gap:** There is no mechanism to collect operator experience data. When operators hit problems, there is no structured way for those problems to feed back into NicheClaw improvement.

**What to do:**

1. Add a `niche feedback` CLI command that captures structured operator feedback:
   - `openclaw niche feedback --program <id> --stage <stage> --rating <1-5> --comment "..."`
   - Stages: `quickstart`, `compile`, `readiness`, `benchmark`, `release`, `run`
   - Persists to `~/.openclaw/niche/feedback/` as timestamped JSON files

2. At the end of `quickstart`, `benchmark`, and `release` commands, print a one-line prompt: "Rate this experience: `openclaw niche feedback --program <id> --stage <stage> --rating <1-5>`"

3. Add a `niche feedback --list` subcommand that summarizes collected feedback by stage and rating.

4. This is intentionally minimal. The goal is not a feedback platform; it is a signal channel that exists and is visible to operators.

**Success criteria:** Running `openclaw niche feedback --list` after the pilot shows at least one feedback entry per stage.

**Dependencies:** None (can be built independently).

**Estimated effort:** 2-3 hours.

**Files to create/modify:**

- Create: `src/commands/niche/feedback.ts`
- Modify: `src/cli/program/register.niche.ts` (register the feedback subcommand)
- Modify: `src/commands/niche/quickstart.ts`, `benchmark.ts`, `release.ts` (add feedback prompt to output)

---

## SF-05: Dogfood NicheClaw on the OpenClaw Agent

**Gap:** The NicheClaw team does not use NicheClaw to specialize their own agents. This is the strongest possible signal that the product is not yet ready.

**What to do:**

1. Define a NicheProgram for the OpenClaw agent's primary workflow: handling user messages through the gateway, selecting tools, executing them, and delivering responses. The domain pack should encode:
   - Tool contracts for the OpenClaw tool set (exec, read, write, web_search, etc.)
   - Evidence source registry for sessions, transcripts, and memory
   - Failure taxonomy for common agent failures (hallucinated tool arguments, missing context, over-eager tool use)
   - Constraints for safe operation (bounded execution, evidence grounding)

2. Compile this program using real OpenClaw documentation and trace data as sources.

3. Run a benchmark comparing a baseline (vanilla OpenClaw) against a candidate (OpenClaw with the dogfood niche stack active) on a suite of representative tasks.

4. If the result shows lift: promote the candidate and use it in development/staging. If no lift: document why and iterate on the domain pack.

5. Record the entire dogfooding process as a case study in `docs/niche/dogfood-case-study.md`.

**Success criteria:** A NicheProgram exists for the OpenClaw agent. A benchmark has been run. The result (positive or negative) is documented with lessons learned.

**Dependencies:** SF-01 (validates the CLI pipeline works), SF-02 (the getting-started guide should be usable for dogfooding).

**Estimated effort:** 1-2 full days.

---

## SF-06: Define Competitive Positioning Document

**Gap:** There is no document explaining how NicheClaw differs from prompt optimization, RAG layers, or fine-tuning services. This matters for internal alpha because operators need to understand why they should use NicheClaw instead of just writing better prompts.

**What to do:**

1. Write `docs/niche/positioning.md` covering:
   - What NicheClaw is NOT: not a prompt optimizer, not a RAG layer, not a fine-tuning API wrapper (per PRD v3 section 5)
   - What NicheClaw IS: a whole-system specialization framework that compiles, benchmarks, and promotes
   - Comparison table:

     | Capability                 | Prompt Tuning | RAG Layer | Fine-Tuning Service | NicheClaw  |
     | -------------------------- | ------------- | --------- | ------------------- | ---------- |
     | Same-model benchmark       | No            | No        | Sometimes           | Always     |
     | Held-out eval gating       | No            | No        | No                  | Yes        |
     | Release promotion policy   | No            | No        | No                  | Yes        |
     | Post-promotion monitoring  | No            | No        | No                  | Yes        |
     | Whole-stack specialization | No            | No        | Model weights only  | Full stack |

   - The key differentiator: NicheClaw proves improvement before deployment. Everything else deploys first and hopes.

2. Keep it under 500 words. This is positioning, not a whitepaper.

**Success criteria:** An operator reading this document can explain in one sentence why NicheClaw is different.

**Dependencies:** None.

**Estimated effort:** 2-3 hours.

---

## SF-07: Create a Demo Script and Replayable Demo Environment

**Gap:** NicheClaw cannot be demonstrated to stakeholders without setting up from scratch. There is no demo script, no recorded walkthrough, no pre-seeded environment.

**What to do:**

1. Create a demo seed script at `scripts/niche-demo-seed.ts` that:
   - Creates a NicheProgram for the repo-ci pilot
   - Ingests the pilot domain pack and benchmark suites from `src/niche/pilots/repo-ci/`
   - Writes baseline and candidate manifests
   - Writes a pre-computed benchmark result record (from SF-03's real results)
   - Writes a release evaluation result
   - Seeds the active niche stack store with a promoted stack

2. Create a demo walkthrough script at `docs/niche/demo-script.md` that:
   - Lists the exact commands to run in sequence
   - Includes expected output for each command
   - Takes under 10 minutes end-to-end
   - Works without a provider API key (uses the pre-seeded data)
   - Highlights the key moments: readiness gate, benchmark delta, release decision, active stack binding

3. The demo script should work with `openclaw niche inspect`, `openclaw niche compare`, and `openclaw niche readiness` (all read-only commands) against the seeded state.

**Success criteria:** Running `bun scripts/niche-demo-seed.ts && <demo commands>` produces a complete walkthrough in under 10 minutes. A stakeholder watching the demo understands the NicheClaw value proposition.

**Dependencies:** SF-01 and SF-03 (need real benchmark results to seed).

**Estimated effort:** 4-6 hours.

---

## SF-08: Write a Release Announcement Draft

**Gap:** There is no blog post, internal announcement, or communication draft for NicheClaw's alpha release.

**What to do:**

1. Write `docs/niche/announcement-draft.md` as an internal alpha announcement containing:
   - One-paragraph summary: "NicheClaw is a specialization framework built into OpenClaw that compiles a niche, benchmarks a specialized agent against a same-model baseline, and promotes the candidate only when it wins."
   - What operators can do today: quickstart, compile, benchmark, release, inspect, compare
   - What the pilot proved (from SF-03): the measured delta on the repo-ci niche
   - Known limitations: MVP scope per PRD section 18 (no direct fine-tuning, no full gyms, no continuous optimization yet, no multi-tenant)
   - How to get started: link to the getting-started guide (SF-02)
   - How to give feedback: link to the feedback mechanism (SF-04)
   - Next milestones: what comes after alpha

2. Keep it factual and honest. Do not overclaim. Use the exact numbers from the proof-of-lift document.

**Success criteria:** The announcement can be sent as-is to internal stakeholders. It accurately represents NicheClaw's current state and capability.

**Dependencies:** SF-02, SF-03, SF-04, SF-06 (references these documents).

**Estimated effort:** 2-3 hours.

---

## SF-09: Define a Rollout Plan

**Gap:** There is no plan for when and how NicheClaw becomes available to operators beyond the development team.

**What to do:**

1. Write `docs/niche/rollout-plan.md` defining:

   **Phase 1: Internal Alpha (current target)**
   - Audience: NicheClaw development team only
   - Distribution: source checkout, `openclaw niche` commands
   - Support: direct developer assistance
   - Duration: 2-4 weeks
   - Exit criteria: 3+ complete pilot loops, getting-started guide validated by 2+ operators, all stage-fit gaps closed

   **Phase 2: Closed Alpha**
   - Audience: 5-10 selected OpenClaw operators
   - Distribution: beta npm tag with `niche` commands included
   - Support: dedicated Discord channel or issue tag
   - Duration: 4-6 weeks
   - Exit criteria: 3+ different niche types piloted, feedback NPS > 3.0, no data-loss bugs

   **Phase 3: Open Beta**
   - Audience: all OpenClaw operators
   - Distribution: stable npm release with niche commands
   - Support: documentation + community
   - Exit criteria: measurable lift demonstrated on 10+ niches

2. For each phase, specify:
   - How operators onboard
   - What telemetry/feedback is collected
   - What would block progression to the next phase
   - What would trigger a rollback to the previous phase

**Success criteria:** A reviewer reading the rollout plan knows exactly what happens next and what gates must pass.

**Dependencies:** SF-02 (getting-started guide exists), SF-04 (feedback mechanism exists).

**Estimated effort:** 2-3 hours.

---

## SF-10: Define Success Metrics for Operators

**Gap:** There is no definition of how we know NicheClaw is working for operators. The PRD defines product metrics (section 21) but they are not operationalized.

**What to do:**

1. Write `docs/niche/success-metrics.md` defining:

   **Leading indicators (measurable now):**
   - Time to first compiled domain pack (target: < 30 minutes)
   - Time to first benchmark result (target: < 2 hours including compile)
   - Percentage of quickstarts that reach benchmark stage (target: > 70%)
   - Percentage of readiness gates that pass on first try (target: > 50%)

   **Lagging indicators (measurable after multiple pilot loops):**
   - Percentage of niches that achieve measurable lift (target: > 40%)
   - Mean delta on primary metric for promoted candidates (target: > 10%)
   - Operator feedback rating by stage (target: > 3.5 / 5)
   - Median total wall-clock time for full loop (target: < 4 hours)

   **Anti-metrics (things that should not happen):**
   - False-win rate: candidates promoted that regress on shadow (target: 0%)
   - Data loss: niche state files corrupted or lost (target: 0)
   - Expert-only completions: percentage of loops that required developer intervention (target: < 20%)

2. For each metric, specify:
   - How it is measured (CLI output, feedback command, benchmark records)
   - Where the data lives (niche stores, feedback files, benchmark result records)
   - Who reviews it and how often

3. Create a `scripts/niche-metrics-report.ts` script that reads the niche stores and feedback files and prints a summary of measurable metrics.

**Success criteria:** Running the metrics report after a pilot session produces numbers for at least the leading indicators.

**Dependencies:** SF-01 (generates the data), SF-04 (feedback data).

**Estimated effort:** 4-6 hours total (document + script).

---

## Sequencing and Dependencies

```
SF-01 (Pilot Execution)
  |
  +---> SF-02 (First Hour Guide)
  |       |
  |       +---> SF-05 (Dogfooding)
  |       +---> SF-08 (Announcement) <--- SF-06
  |
  +---> SF-03 (Proof of Lift)
  |       |
  |       +---> SF-07 (Demo Environment)
  |       +---> SF-08 (Announcement)
  |
  +---> SF-10 (Success Metrics)

SF-04 (Feedback Mechanism) --- independent, start early
  |
  +---> SF-09 (Rollout Plan)
  +---> SF-10 (Success Metrics)

SF-06 (Positioning) --- independent, start early
  |
  +---> SF-08 (Announcement)
```

**Recommended execution order:**

1. SF-04 + SF-06 (independent, unblock later items)
2. SF-01 (the critical path -- everything depends on a real pilot)
3. SF-02 + SF-03 (consume pilot results)
4. SF-10 (defines metrics using pilot data)
5. SF-07 + SF-09 (demo and rollout)
6. SF-05 (dogfooding, validates the guide)
7. SF-08 (announcement, last because it references everything)

**Total estimated effort:** 4-6 person-days.

---

## Scoring Rationale

| Item      | Gap Closed                     | Points                                 |
| --------- | ------------------------------ | -------------------------------------- |
| SF-01     | Proven real-world pilot        | +12                                    |
| SF-02     | First-hour operator experience | +8                                     |
| SF-03     | Success story / proof of lift  | +6                                     |
| SF-04     | Operator feedback loop         | +3                                     |
| SF-05     | Dogfooding                     | +4                                     |
| SF-06     | Competitive positioning        | +2                                     |
| SF-07     | Demo environment               | +4                                     |
| SF-08     | Release announcement draft     | +2                                     |
| SF-09     | Rollout plan                   | +4                                     |
| SF-10     | Success metrics defined        | +3                                     |
| **Total** |                                | **+48** (62 + 48 = 110, capped at 100) |

The largest point contributions come from SF-01 (executing the pilot), SF-02 (operator experience), and SF-03 (proof of lift). These three items alone would bring the score from 62 to approximately 88. The remaining items provide the surrounding context that a true MVP requires.

---

### Critical Files for Implementation

- `src/commands/niche/quickstart.ts` - The primary operator entry point; its output quality directly determines first-hour experience (SF-02) and must be validated during the pilot (SF-01)
- `src/niche/benchmark/live-benchmark.ts` - The live benchmark execution path that must work end-to-end with real model calls for SF-01 and SF-03; contains `runLiveAtomicBenchmark` and `executePreparedSeedCase`
- `src/niche/pilots/repo-ci/seed-domain-pack.ts` - The pilot domain pack seed data; must be validated against a real repository and potentially enriched based on pilot findings (SF-01, SF-05)
- `test/niche/e2e/full-pipeline.test.ts` - The E2E test that proves the full loop works in automation; the pilot execution (SF-01) must demonstrate equivalent steps succeed outside test harnesses
- `src/cli/program/register.niche.ts` - The CLI command registration surface; must be modified to add the feedback subcommand (SF-04) and is the canonical index of all operator-facing commands
