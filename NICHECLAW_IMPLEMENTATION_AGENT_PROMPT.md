# NicheClaw Implementation Agent Prompt

Copy-paste the prompt below into a coding agent working in this repository.

```text
You are implementing NicheClaw inside this OpenClaw fork.

Your job is to execute the NicheClaw implementation plan with production-ready code, not to restate the plan.

Read these files first and treat them as required context:

1. NICHECLAW_IMPLEMENTATION_SOURCE_OF_TRUTH.md
2. NICHECLAW_CORRECTED_SYSTEM_BLUEPRINT.md
3. NICHECLAW_PRD_V3.md
4. NICHECLAW_PRD_V3_1_TECHNICAL_ANNEX.md
5. NICHECLAW_PRD_V3_1A_PATCH.md
6. PRD.md
7. ARCHITECTURE.md
8. AGENTS.md

Then audit and implement against these repo targets first:

- src/niche/
- src/commands/niche/
- src/commands/agent.ts
- src/commands/agent/delivery.ts
- src/agents/pi-embedded-runner/
- src/agents/tool-policy-pipeline.ts
- src/agents/pi-tools.policy.ts
- src/auto-reply/reply/
- src/gateway/server-methods/
- src/cli/program/register.niche.ts
- src/cli/program/command-registry.ts
- src/plugins/
- ui/
- test/niche/

Locked decisions you must follow:

1. Active promoted niche stack scope:
   - hybrid model
   - canonical anchor is agent
   - effective overrides can come from session and route/channel/account overlays
   - precedence is:
     session override > route/channel/account override > agent default
   - persist the resolved stack and resolution source on session/run-trace state

2. Live benchmark execution:
   - synchronous-first
   - but design the runner behind a job-compatible contract
   - promotion-authoritative benchmark evidence must come from live runtime execution, not typed execution bundle ingestion

3. Surfaced product stage:
   - gateway API + minimal read-first Control UI only
   - do not build a standalone NicheClaw frontend
   - do not pull apps/ into the MVP-critical path

4. Prepared seed:
   - keep it
   - it remains a supported advanced/operator and internal substrate
   - it is not the primary product UX

Execution rules:

- Implement against NICHECLAW_IMPLEMENTATION_SOURCE_OF_TRUTH.md as the single execution source of truth.
- Do not jump ahead in the critical path.
- Do not gold-plate.
- Do not invent new platform layers unless the existing OpenClaw seams are proven insufficient.
- Preserve existing OpenClaw behavior outside explicit NicheClaw paths.
- Prefer extending existing OpenClaw machinery over building parallel systems.
- Keep diffs small and surgical.
- Add or update tests for every semantic change.
- Never claim the product loop is closed unless the relevant runtime behavior, persistence, and verification are all real.

Current repo reality you must respect:

- NicheClaw already has substantial schemas, stores, benchmark logic, runtime seed plumbing, release logic, optimizer planning, and tests.
- The missing loop closures are still:
  - runtime-wide active stack binding
  - surfaced compile/readiness flow
  - promotion-authoritative live benchmark execution
  - release actuation
  - monitor service
  - optimizer execution
  - gateway/UI surfacing

Current branch health you must fix first:

- Run `pnpm test:niche` immediately.
- Treat the currently failing contract/store/verifier tests as the first blocking milestone.
- Do not move to later milestones until the niche slice is green again.

Required implementation order:

1. Milestone 1: stable niche contract surface
   - fix current manifest/trace/replay/verifier contract drift
   - ensure niche-targeted tests are green

2. Milestone 2: runtime-bound niche execution
   - add active niche stack resolution
   - bind it into real runtime seams
   - persist resolution source and lifecycle evidence
   - overlay niche action policy on top of the existing tool policy pipeline

3. Milestone 3: honest compile-to-benchmark loop
   - close create/ingest/compile/readiness
   - generate manifests from real runtime state
   - replace offline bundle scoring as promotion-authoritative evidence with synchronous live execution through the real runtime path

4. Milestone 4: governed release loop
   - persist agent-default promoted stack state
   - add route/channel/account rollout overlays
   - actuate shadow/canary/live/rollback behavior
   - add monitor cadence and rollback triggers

5. Milestone 5: surfaced MVP product loop
   - add gateway methods
   - add minimal read-first Control UI
   - execute one real optimizer lane with governed artifact outputs

Hard constraints:

- Build inside OpenClaw, not beside it.
- No large package split.
- No worker-first benchmark infrastructure yet.
- No standalone NicheClaw app.
- No removal of prepared-seed flows.
- No event-sourced platform or Artifact OS work.
- No full workflow engine.

Validation requirements:

For each milestone:

1. run the smallest relevant tests first
2. run `pnpm test:niche`
3. run the smallest relevant non-niche seam tests that cover patched runtime surfaces
4. run `pnpm build:strict-smoke`
5. if milestone touches broader repo wiring, run `pnpm build`

Session working style:

- Work milestone by milestone.
- Finish the highest-priority incomplete milestone before touching later milestones.
- If the milestone is too large for one session, finish a coherent subset and stop at a clean boundary.
- At the end of the session, report:
  - what was implemented
  - what verification passed or failed
  - which milestone/task is next on the critical path

Definition of done for this session:

- You must start by running `pnpm test:niche`.
- You must fix the currently failing niche contract/store/verifier tests before moving to later loop-closure work.
- You must then continue with the highest-priority incomplete milestone on the critical path from NICHECLAW_IMPLEMENTATION_SOURCE_OF_TRUTH.md.
- Write 100% complete, production-ready code. No TODO markers, no placeholders, no fake implementations.
```
