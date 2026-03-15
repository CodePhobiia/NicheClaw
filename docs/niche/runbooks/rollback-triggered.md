# Runbook: Rollback Triggered

## Symptoms

- The `candidate_rolled_back` lifecycle event fires.
- The active stack state shows `release_mode: "rolled_back"` for a stack record.
- Users report that the agent reverted to baseline behavior.

## Diagnosis Steps

1. **Identify the rolled-back stack.** Use `niche.runtime.state` to list all stacks. Look for `release_mode: "rolled_back"`.

2. **Read the rollback event.** Query `niche.events.list` or the audit log. The `candidate_rolled_back` payload includes `rolled_back_stack_id`, `rollback_target`, `reason`, and `overlays_cleared`.

3. **Determine the trigger.** Rollbacks can be triggered by:
   - **Operator action:** Via `niche.release.rollback` gateway method or CLI.
   - **Monitor assessment:** The promoted monitor detected a threshold breach and auto-rolled-back.
   - **Policy engine:** The release policy engine detected a violation.

4. **Check monitor observations.** If the rollback was monitor-triggered, review the monitor definition's thresholds and the observation that tripped the rollback.

## What Happens During Rollback

1. The active stack record's `release_mode` is set to `rolled_back`.
2. All route overlays pointing to the rolled-back stack are cleared (`overlays_cleared` count in the event).
3. Agent defaults pointing to the rolled-back stack are removed.
4. Subsequent runs that would have resolved to this stack now fall through to baseline (return `null` from stack resolution).

## Resolution

- **Investigate root cause.** If the rollback was due to a quality regression, fix the candidate and create a new compilation/manifest cycle.
- **Re-promote.** If the rollback was a false positive, create a new active stack record with the same candidate manifest.
- **Adjust thresholds.** If the monitor is too sensitive, update the monitor definition's thresholds.

## Prevention

- Use shadow mode and canary releases before full promotion.
- Set realistic monitor thresholds based on baseline performance data.
- Review the `rollbacks_total` metric trend.
