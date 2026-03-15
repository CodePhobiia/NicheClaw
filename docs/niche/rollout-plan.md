---
summary: "Phased rollout plan for NicheClaw from internal alpha through open beta."
title: "Rollout Plan"
---

# NicheClaw Rollout Plan

## Phase 1: Internal Alpha

**Goal:** Validate the full pipeline end-to-end with internal operators.

**Duration:** 2-4 weeks.

**Entry criteria:**

- All CLI commands pass CI.
- Getting-started guide is complete and tested.
- Demo seed script works on a clean workspace.
- Feedback command is operational.

**Activities:**

- Internal operators run the quickstart and getting-started guide.
- At least one niche program goes through the full cycle: create, compile, readiness, benchmark, release.
- Collect feedback via `openclaw niche feedback` after each stage.
- Fix blockers and paper cuts surfaced by feedback.

**Exit criteria:**

- At least one niche program has been promoted through the release gate with demonstrated lift.
- No P0 blockers remain in the feedback log.
- Operator satisfaction rating averages 3.5/5 or higher across stages.

## Phase 2: Closed Alpha

**Goal:** Expand to selected external operators with guided onboarding.

**Duration:** 4-6 weeks.

**Entry criteria:**

- Phase 1 exit criteria met.
- Positioning document reviewed and approved.
- Runbooks cover common failure modes.

**Activities:**

- Invite 5-10 external operators with diverse domain needs.
- Provide 1:1 onboarding sessions using the getting-started guide.
- Monitor benchmark result quality and release decision accuracy.
- Collect structured feedback and iterate on UX.

**Exit criteria:**

- At least 3 external operators have completed the full pipeline.
- No data loss or governance violations reported.
- Documentation covers all questions raised during onboarding.

## Phase 3: Open Beta

**Goal:** Make NicheClaw available to all OpenClaw users.

**Duration:** Ongoing until GA.

**Entry criteria:**

- Phase 2 exit criteria met.
- Gateway method coverage is complete.
- UI views are stable and tested.

**Activities:**

- Announce via release notes and documentation.
- Monitor adoption metrics (programs created, benchmarks run, releases promoted).
- Track anti-metrics (rollback rate, abandoned pipelines, store corruption).
- Iterate based on metrics and community feedback.

**Exit criteria (for GA):**

- Adoption metrics show sustained usage growth.
- Anti-metrics remain below thresholds defined in success-metrics.md.
- No outstanding governance or data safety concerns.
