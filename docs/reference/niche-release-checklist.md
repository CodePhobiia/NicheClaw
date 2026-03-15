---
title: "NicheClaw Release Checklist"
summary: "Pre-release validation steps for NicheClaw governed specialization releases"
read_when:
  - Cutting a NicheClaw release
  - Verifying NicheClaw readiness before promotion
---

# NicheClaw Release Checklist

Complete these steps before promoting a NicheClaw specialization to production.

## 1. Schema and store integrity

- [ ] Run `openclaw niche verify` and confirm zero errors.
- [ ] Confirm `NICHE_SCHEMA_VERSION` in `src/niche/schema/common.ts` matches the store `.schema-version`.
- [ ] Run `node scripts/check-niche-no-type-any.mjs` and confirm no `Type.Any()` in schema files.

## 2. Readiness gate

- [ ] Run `openclaw niche readiness --niche-program-id <id> --json` and confirm `status: "ready"` with no hard blockers.
- [ ] Review any warnings and document accepted risks.

## 3. Benchmark evidence

- [ ] Execute a live benchmark: `openclaw niche benchmark --live --from-program <id> --suite <suite> --json`.
- [ ] Confirm paired delta summary shows no quality regression beyond thresholds.
- [ ] Verify contamination audit returns `contamination_detected: false`.

## 4. Release policy evaluation

- [ ] Run `openclaw niche release --from-program <id> ...` and confirm `decision: "promote"`.
- [ ] If decision is `block` or `defer`, resolve the listed policy violations before retrying.

## 5. CI quality gate

- [ ] Confirm `pnpm test:niche` passes all niche test suites.
- [ ] Confirm `pnpm check` passes (includes format, types, lint).
- [ ] Verify niche CI matrix entry is green in the PR/push pipeline.

## 6. Runtime validation

- [ ] Run `openclaw niche prepare-run` and `openclaw niche run` with a test message to verify end-to-end runtime path.
- [ ] Inspect the resulting run trace for expected tool calls and verifier decisions.

## 7. Changelog and documentation

- [ ] Confirm user-facing NicheClaw entries are present in `CHANGELOG.md` under the target release.
- [ ] Review any new docs or updated references.

## 8. Final sign-off

- [ ] Operator approval recorded (release command `--approved-by` flag or manual confirmation).
- [ ] Tag the release commit per the standard release flow in `docs/reference/RELEASING.md`.
