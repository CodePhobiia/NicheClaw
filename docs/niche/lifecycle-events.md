---
summary: "How NicheClaw lifecycle events work, all 9 event types with payload descriptions, and how to subscribe for audit, integration, and debugging."
read_when:
  - You want to subscribe to NicheClaw lifecycle events
  - You need to understand what events NicheClaw emits
  - You are building integrations or audit pipelines on NicheClaw
title: "Lifecycle Events Guide"
---

# Lifecycle Events Guide

NicheClaw emits structured lifecycle events at key points during run execution, benchmarking, and release management. These events enable audit logging, external integrations, real-time dashboards, and debugging.

## What lifecycle events are

Lifecycle events are typed, structured records emitted by the NicheClaw runtime. Each event describes something that happened during a NicheClaw operation: a planner made a decision, a verifier approved or vetoed an action, a benchmark case finished, or a candidate was promoted or rolled back.

Events are defined in `src/niche/contracts/lifecycle.ts`. There are exactly 9 event types, each with a typed payload schema validated with TypeBox.

## How events are emitted

Events are emitted through the `niche_lifecycle` plugin hook. Any installed plugin can register a handler for this hook to receive events as they occur.

```typescript
// In a plugin definition
export default {
  name: "my-audit-plugin",
  hooks: {
    niche_lifecycle: async (event) => {
      // event is a fully typed LifecycleEvent
      console.log(`[${event.event_type}] run=${event.run_id} at ${event.occurred_at}`);
    },
  },
};
```

Events are emitted synchronously during run execution. If your handler performs async work (writing to a database, calling an API), it should be non-blocking or use a buffer to avoid slowing down the run.

## Event envelope structure

Every lifecycle event shares a common envelope with these fields:

| Field                   | Type                  | Description                       |
| ----------------------- | --------------------- | --------------------------------- |
| `event_id`              | Identifier            | Unique ID for this event          |
| `event_type`            | string                | One of the 9 event type values    |
| `occurred_at`           | Timestamp             | ISO 8601 UTC timestamp            |
| `run_id`                | Identifier            | The run this event belongs to     |
| `niche_program_id`      | Identifier            | The Niche Program                 |
| `baseline_manifest_id`  | Identifier (optional) | Baseline manifest, if applicable  |
| `candidate_manifest_id` | Identifier (optional) | Candidate manifest, if applicable |

The `payload` field is specific to each event type.

## Event types

### planner_proposed

Emitted when the planner selects a manifest and prepares to execute.

**Payload fields:**

| Field                          | Type                                  | Description                       |
| ------------------------------ | ------------------------------------- | --------------------------------- |
| `selected_manifest_id`         | Identifier                            | The manifest the planner selected |
| `planner_runtime_component_id` | Identifier                            | Which planner component ran       |
| `benchmark_suite_id`           | Identifier (optional)                 | Suite ID if in benchmark mode     |
| `active_stack_id`              | Identifier (optional)                 | Active stack record, if resolved  |
| `resolution_source`            | NicheStackResolutionSource (optional) | How the stack was resolved        |
| `resolved_release_mode`        | NicheStackReleaseMode (optional)      | The release mode in effect        |

### action_proposed

Emitted when an action is proposed for execution. The payload follows the `ActionSeamInput` schema from the contracts layer, containing the full action proposal details including the selected tool, arguments, and context.

### action_validated

Emitted after the guard layer validates a proposed action.

**Payload fields:**

| Field                 | Type                  | Description                                    |
| --------------------- | --------------------- | ---------------------------------------------- |
| `proposal_id`         | Identifier            | The proposal being validated                   |
| `guard_decision`      | string                | The guard's decision                           |
| `ready_for_execution` | boolean               | Whether the action can proceed                 |
| `repair_strategy_id`  | Identifier (optional) | Repair strategy if the action needs correction |

### verifier_decision

Emitted when the verifier makes a decision on a proposed action. The payload follows the `VerifierSeamOutput` schema, containing the outcome (approved, repair_requested, escalated, or vetoed), rationale, and findings.

### run_trace_persisted

Emitted after a run trace is written to the store.

**Payload fields:**

| Field                  | Type                | Description                                  |
| ---------------------- | ------------------- | -------------------------------------------- |
| `trace_id`             | Identifier          | The persisted trace ID                       |
| `replayability_status` | ReplayabilityStatus | Whether the trace is replayable              |
| `persisted_path`       | string              | File system path where the trace was written |

### benchmark_case_started

Emitted when a benchmark case begins execution.

**Payload fields:**

| Field                | Type                   | Description                                  |
| -------------------- | ---------------------- | -------------------------------------------- |
| `benchmark_arm_id`   | Identifier             | Which arm (baseline or candidate) is running |
| `benchmark_case_ref` | BenchmarkCaseReference | The case kind and case ID                    |

### benchmark_case_finished

Emitted when a benchmark case completes.

**Payload fields:**

| Field                | Type                   | Description                           |
| -------------------- | ---------------------- | ------------------------------------- |
| `benchmark_arm_id`   | Identifier             | Which arm ran                         |
| `benchmark_case_ref` | BenchmarkCaseReference | The case kind and case ID             |
| `invalidated`        | boolean                | Whether the result was invalidated    |
| `outcome_summary`    | string                 | Human-readable summary of the outcome |

### candidate_promoted

Emitted when a candidate is promoted to production.

**Payload fields:**

| Field                  | Type       | Description                           |
| ---------------------- | ---------- | ------------------------------------- |
| `candidate_release_id` | Identifier | The release that was promoted         |
| `rollback_target`      | Identifier | The release to roll back to if needed |

### candidate_rolled_back

Emitted when a promoted candidate is rolled back.

**Payload fields:**

| Field                  | Type       | Description                          |
| ---------------------- | ---------- | ------------------------------------ |
| `rolled_back_stack_id` | Identifier | The stack that was rolled back       |
| `rollback_target`      | Identifier | The release that is now active       |
| `reason`               | string     | Why the rollback occurred            |
| `overlays_cleared`     | number     | How many route overlays were cleared |

## How to subscribe

### Plugin hook

The primary subscription mechanism is a plugin that registers the `niche_lifecycle` hook:

```typescript
import type { OpenClawPlugin } from "openclaw/plugin-sdk";

const auditPlugin: OpenClawPlugin = {
  name: "niche-audit",
  hooks: {
    niche_lifecycle: async (event) => {
      switch (event.event_type) {
        case "candidate_promoted":
          await notifyTeam(event.payload.candidate_release_id);
          break;
        case "candidate_rolled_back":
          await alertOncall(event.payload.reason);
          break;
      }
    },
  },
};

export default auditPlugin;
```

### Filtering by event type

Since all events share the `event_type` discriminator, you can filter within your handler:

```typescript
niche_lifecycle: async (event) => {
  // Only process benchmark events
  if (event.event_type === "benchmark_case_finished") {
    if (event.payload.invalidated) {
      console.warn(`Case ${event.payload.benchmark_case_ref.case_id} was invalidated`);
    }
  }
};
```

## Use cases

### Audit trail

Subscribe to all events and write them to an append-only log. Every NicheClaw operation produces a sequence of events that forms a complete audit trail from planner decision through verification, trace persistence, and release.

### External integration

Forward events to external systems. For example:

- Send `candidate_promoted` events to a Slack channel
- Forward `benchmark_case_finished` events to a metrics dashboard
- Trigger CI/CD pipelines on `run_trace_persisted` events

### Debugging

Events provide visibility into the runtime decision chain:

1. **Planner debugging**: `planner_proposed` shows which manifest was selected and how the stack was resolved.
2. **Action debugging**: `action_proposed` followed by `action_validated` shows whether the guard approved the action and whether repair was needed.
3. **Verifier debugging**: `verifier_decision` shows the outcome, rationale, and specific findings.
4. **Benchmark debugging**: `benchmark_case_started` and `benchmark_case_finished` pairs show timing, invalidation, and per-case outcomes.
5. **Release debugging**: `candidate_promoted` and `candidate_rolled_back` show promotion and rollback decisions with reasons.

### Real-time monitoring

Combine `benchmark_case_finished` events to build a live progress view of benchmark runs. Track `invalidated` counts and `outcome_summary` values to detect problems early before the full suite completes.
