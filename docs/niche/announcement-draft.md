---
summary: "Internal alpha announcement for NicheClaw governed agent specialization."
title: "NicheClaw Alpha Announcement (Internal)"
---

# NicheClaw Alpha Announcement

## What is NicheClaw?

NicheClaw is a governed agent specialization framework built into OpenClaw. It compiles domain knowledge into a structured domain pack, benchmarks a specialized candidate agent against a same-model baseline, and promotes the candidate only when it demonstrably outperforms -- with full audit trail and rollback support.

## Why does this matter?

Today, specializing an AI agent for a domain means hand-tuning prompts and hoping for the best. There is no systematic way to prove that changes actually help, detect contamination in evaluations, or roll back when things go wrong.

NicheClaw solves this by making specialization a governed, evidence-based process:

- **Compile** domain knowledge from source descriptors into a structured domain pack.
- **Benchmark** the specialized candidate against a same-model baseline on held-out evaluation suites.
- **Release** only when the candidate passes policy gates, with contamination auditing and verifier approval.
- **Monitor** promoted stacks in production with automatic rollback support.

## What is available now?

The full NicheClaw control plane is available as CLI subcommands under `openclaw niche`:

- `niche init` -- Initialize the workspace and write a starter program.
- `niche create` -- Store a validated niche program definition.
- `niche compile` -- Compile domain sources into a domain pack with readiness enforcement.
- `niche readiness` -- Check readiness gates before benchmarking.
- `niche benchmark` -- Run live or typed benchmark comparisons.
- `niche release` -- Evaluate promotion policy and emit governed release decisions.
- `niche optimize` -- Plan and execute optimization jobs (candidate generation, teacher rollout).
- `niche run` -- Execute readiness-gated seeded runs through the trusted agent path.
- `niche feedback` -- Submit and review operator feedback per pipeline stage.

Supporting commands: `niche list`, `niche status`, `niche next`, `niche pipeline`, `niche inspect`, `niche compare`, `niche export`, `niche import`, `niche gc`, `niche verify`, `niche quickstart`.

## Who should try it?

Internal operators who want to specialize OpenClaw for a specific domain (repo CI workflows, customer support, code review, etc.) and want evidence that the specialization actually works before deploying it.

## How to get started

```bash
openclaw niche quickstart
```

Or follow the step-by-step guide at `docs/niche/guides/getting-started.md`.

## Known limitations (alpha)

- Live benchmarking requires valid API keys for the configured provider.
- Optimization job execution (beyond preview/planning) requires provider access.
- The UI integration is available but still maturing.
- Gateway method coverage for niche operations is partial.

## Feedback

Use the built-in feedback command to share your experience:

```bash
openclaw niche feedback --niche-program-id <id> --stage compile --rating 4 --comment "Smooth experience"
openclaw niche feedback --list
```

Or reach out directly on the internal channel.
