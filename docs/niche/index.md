---
summary: "NicheClaw is a governed AI agent specialization framework that compiles niche knowledge, benchmarks candidates against baselines, and promotes winners."
read_when:
  - You want to understand what NicheClaw does
  - You are evaluating NicheClaw for your team
title: "NicheClaw Overview"
---

# NicheClaw Overview

NicheClaw is a governed AI agent specialization framework built into OpenClaw. It compiles niche knowledge into a deployable Niche Stack, benchmarks candidates against a same-model baseline, and promotes only when the candidate outperforms — with full audit trail.

## Who is it for

NicheClaw is for operators and builders who want measurable, governed agent specialization — not prompt packs. If you want to prove that your specialized agent actually performs better than a general-purpose one, NicheClaw provides the framework to do so.

## The core promise

Choose a niche, connect your data and tools, choose your runtime model, and NicheClaw will build and validate a specialized version of that agent before it goes live. Every promotion decision is backed by benchmark evidence, every artifact is governed, and every release is auditable.

## The pipeline at a glance

<Steps>
  <Step title="Define a Niche Program">
    Create a JSON manifest describing your specialization: objective, risk class, allowed tools, data sources, success metrics, and governance policies.
  </Step>
  <Step title="Compile domain knowledge">
    Feed source descriptors (documentation, examples, constraints, tool schemas) into the compiler. It produces a Domain Pack, Source Access Manifest, and Readiness Report.
  </Step>
  <Step title="Achieve readiness">
    The readiness gate evaluates 9 dimensions. Fix any hard blockers (insufficient rights, too few benchmark seeds, low tool coverage) before proceeding.
  </Step>
  <Step title="Benchmark baseline vs candidate">
    Run the same model with the general configuration (baseline) and the specialized configuration (candidate) through identical benchmark cases. Measure the delta.
  </Step>
  <Step title="Release the winner">
    If the candidate outperforms the baseline with statistical confidence, promote it. NicheClaw supports live, canary, and shadow release modes with automatic rollback.
  </Step>
</Steps>

## Quick links

- **[Getting Started](/niche/guides/getting-started)** — Set up your first niche program in minutes
- **[Concepts](/niche/concepts/niche-program)** — Understand the mental model
- **[CLI Reference](/niche/reference/cli-commands)** — Every command documented
- **[Example Project](/niche/examples/repo-ci-specialist)** — A complete worked example
