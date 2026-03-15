import { describe, expect, it } from "vitest";
import { canAccessNicheProgram } from "../../../src/niche/domain/access-control.js";
import type { NicheProgram } from "../../../src/niche/schema/index.js";

function makeProgram(overrides: Partial<NicheProgram> = {}): NicheProgram {
  return {
    niche_program_id: "test-program",
    name: "Test Program",
    objective: "Testing access control.",
    risk_class: "low",
    runtime_stack: {
      planner_runtime: {
        component_id: "planner",
        provider: "openai",
        model_id: "gpt-5",
      },
      specialization_lanes: ["system_specialization"],
    },
    allowed_tools: ["read"],
    allowed_sources: [{ source_id: "src", source_kind: "repos" }],
    success_metrics: [
      {
        metric_id: "accuracy",
        label: "Accuracy",
        objective: "maximize",
        target_description: "High accuracy.",
        measurement_method: "benchmark",
      },
    ],
    rights_and_data_policy: {
      storage_policy: "store approved",
      training_policy: "train only approved",
      benchmark_policy: "hold out eval",
      retention_policy: "retain per governance",
      redaction_policy: "redact sensitive",
      pii_policy: "avoid PII",
      live_trace_reuse_policy: "embargo traces",
      operator_review_required: true,
    },
    ...overrides,
  };
}

describe("canAccessNicheProgram", () => {
  it("grants access to operator.admin regardless of ownership", () => {
    const program = makeProgram({ owner_id: "other-user" });
    expect(
      canAccessNicheProgram({
        program,
        clientId: "admin-user",
        scopes: ["operator.admin"],
        action: "write",
      }),
    ).toBe(true);
  });

  it("grants access to niche.admin regardless of ownership", () => {
    const program = makeProgram({ owner_id: "other-user" });
    expect(
      canAccessNicheProgram({
        program,
        clientId: "admin-user",
        scopes: ["niche.admin"],
        action: "write",
      }),
    ).toBe(true);
  });

  it("grants open access when no owner_id is set (legacy)", () => {
    const program = makeProgram();
    expect(
      canAccessNicheProgram({ program, clientId: "any-user", scopes: [], action: "read" }),
    ).toBe(true);
    expect(
      canAccessNicheProgram({ program, clientId: "any-user", scopes: [], action: "write" }),
    ).toBe(true);
  });

  it("grants access to the owner", () => {
    const program = makeProgram({ owner_id: "owner-a" });
    expect(
      canAccessNicheProgram({ program, clientId: "owner-a", scopes: [], action: "write" }),
    ).toBe(true);
  });

  it("denies access to non-owner when no access_policy is set", () => {
    const program = makeProgram({ owner_id: "owner-a" });
    expect(
      canAccessNicheProgram({ program, clientId: "other-user", scopes: [], action: "read" }),
    ).toBe(false);
    expect(
      canAccessNicheProgram({ program, clientId: "other-user", scopes: [], action: "write" }),
    ).toBe(false);
  });

  it("grants read access to listed readers", () => {
    const program = makeProgram({
      owner_id: "owner-a",
      access_policy: { readers: ["reader-1", "reader-2"], writers: [] },
    });
    expect(
      canAccessNicheProgram({ program, clientId: "reader-1", scopes: [], action: "read" }),
    ).toBe(true);
    expect(
      canAccessNicheProgram({ program, clientId: "reader-1", scopes: [], action: "write" }),
    ).toBe(false);
  });

  it("grants write access to listed writers", () => {
    const program = makeProgram({
      owner_id: "owner-a",
      access_policy: { readers: [], writers: ["writer-1"] },
    });
    expect(
      canAccessNicheProgram({ program, clientId: "writer-1", scopes: [], action: "write" }),
    ).toBe(true);
    expect(
      canAccessNicheProgram({ program, clientId: "writer-1", scopes: [], action: "read" }),
    ).toBe(false);
  });

  it("denies access to unlisted clients", () => {
    const program = makeProgram({
      owner_id: "owner-a",
      access_policy: { readers: ["reader-1"], writers: ["writer-1"] },
    });
    expect(
      canAccessNicheProgram({ program, clientId: "stranger", scopes: [], action: "read" }),
    ).toBe(false);
    expect(
      canAccessNicheProgram({ program, clientId: "stranger", scopes: [], action: "write" }),
    ).toBe(false);
  });
});
