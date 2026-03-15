import { describe, expect, it } from "vitest";
import {
  buildReadinessRefusal,
  evaluateReadinessGate,
} from "../../../src/niche/domain/readiness-gate.js";
import { DEFAULT_READINESS_THRESHOLDS } from "../../../src/niche/domain/readiness-thresholds.js";
import { propagateDerivedRights } from "../../../src/niche/domain/rights-propagation.js";
import type { ArtifactRightsState } from "../../../src/niche/schema/index.js";

function makeRightsState(overrides: Partial<ArtifactRightsState> = {}): ArtifactRightsState {
  return {
    rights_to_store: true,
    rights_to_train: true,
    rights_to_benchmark: true,
    rights_to_derive: true,
    rights_to_distill: true,
    rights_to_generate_synthetic_from: true,
    ...overrides,
  };
}

describe("rights propagation", () => {
  it("inherits the most restrictive rights state across lineage", () => {
    const propagated = propagateDerivedRights([
      makeRightsState(),
      makeRightsState({
        rights_to_train: false,
        rights_to_distill: false,
      }),
    ]);

    expect(propagated.inheritedFromLineage).toBe(true);
    expect(propagated.rightsState).toEqual(
      makeRightsState({
        rights_to_train: false,
        rights_to_distill: false,
      }),
    );
  });

  it("allows an explicit stronger authorization override", () => {
    const propagated = propagateDerivedRights(
      [
        makeRightsState({
          rights_to_train: false,
          rights_to_distill: false,
        }),
      ],
      {
        authorization_override_id: "override-1",
        rights_to_train: true,
        rights_to_distill: true,
      },
    );

    expect(propagated.inheritedFromLineage).toBe(false);
    expect(propagated.authorizationOverrideId).toBe("override-1");
    expect(propagated.rightsState.rights_to_train).toBe(true);
    expect(propagated.rightsState.rights_to_distill).toBe(true);
  });
});

describe("readiness gate", () => {
  it("emits a ready_with_warnings report when only non-blocking dimensions are weak", () => {
    const report = evaluateReadinessGate({
      nicheProgramId: "repo-ci-specialist",
      generatedAt: "2026-03-12T12:00:00.000Z",
      thresholds: DEFAULT_READINESS_THRESHOLDS,
      rightsState: makeRightsState(),
      dimensionValues: {
        source_quality: 65,
        source_coverage: 85,
        contradiction_rate: 10,
        freshness: 55,
        rights_sufficiency: 75,
        task_observability: 90,
        benchmarkability: 90,
        measurable_success_criteria: 60,
        tool_availability: 90,
      },
    });

    expect(report.status).toBe("ready_with_warnings");
    expect(report.hard_blockers).toEqual([]);
    expect(report.warnings.map((warning) => warning.warning_code)).toEqual(
      expect.arrayContaining([
        "low_source_quality",
        "low_freshness",
        "weak_success_criteria",
        "rights_need_review",
      ]),
    );
  });

  it("emits hard blockers and a machine-readable refusal for non-ready niches", () => {
    const report = evaluateReadinessGate({
      nicheProgramId: "repo-ci-specialist",
      generatedAt: "2026-03-12T12:01:00.000Z",
      thresholds: DEFAULT_READINESS_THRESHOLDS,
      rightsState: makeRightsState({
        rights_to_store: false,
        rights_to_benchmark: false,
      }),
      dimensionValues: {
        source_quality: 85,
        source_coverage: 15,
        contradiction_rate: 50,
        freshness: 85,
        rights_sufficiency: 40,
        task_observability: 85,
        benchmarkability: 40,
        measurable_success_criteria: 80,
        tool_availability: 50,
      },
    });
    const refusal = buildReadinessRefusal(report);

    expect(report.status).toBe("not_ready");
    expect(report.hard_blockers.map((blocker) => blocker.blocker_code)).toEqual(
      expect.arrayContaining([
        "insufficient_rights_to_use",
        "benchmarkability_below_minimum_threshold",
        "contradiction_rate_exceeds_hard_threshold",
        "tool_availability_inadequate_for_workflow",
        "source_coverage_too_low_for_benchmarkable_domain_pack",
      ]),
    );
    expect(report.recommended_next_actions.map((action) => action.action_id)).toEqual(
      expect.arrayContaining(["resolve_rights_gap", "increase_source_coverage"]),
    );
    expect(refusal.ready).toBe(false);
    expect(refusal.reason).toMatch(/storage and benchmarking/i);
  });
});
