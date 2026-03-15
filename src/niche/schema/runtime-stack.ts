import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";
import { NicheStackReleaseModeSchema, NicheStackResolutionSourceSchema } from "./activation.js";
import { IdentifierString, NonEmptyString, TimestampString } from "./common.js";
import { PreparedNicheRunSeedSchema } from "./runtime-seed.js";

export const ActiveNicheStackRecordSchema = Type.Object(
  {
    active_stack_id: IdentifierString,
    niche_program_id: IdentifierString,
    candidate_manifest_id: IdentifierString,
    registered_at: TimestampString,
    release_mode: NicheStackReleaseModeSchema,
    run_seed_template: PreparedNicheRunSeedSchema,
    canary_fraction: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    shadow_dual_execute: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export const ActiveNicheAgentDefaultBindingSchema = Type.Object(
  {
    agent_id: NonEmptyString,
    active_stack_id: IdentifierString,
    updated_at: TimestampString,
  },
  { additionalProperties: false },
);

export const ActiveNicheRouteOverlaySchema = Type.Object(
  {
    overlay_id: IdentifierString,
    agent_id: NonEmptyString,
    active_stack_id: IdentifierString,
    updated_at: TimestampString,
    channel: Type.Optional(NonEmptyString),
    account_id: Type.Optional(NonEmptyString),
    to: Type.Optional(NonEmptyString),
    resolution_source: Type.Optional(NicheStackResolutionSourceSchema),
  },
  { additionalProperties: false },
);

export const ActiveNicheRuntimeStateSchema = Type.Object(
  {
    stacks: Type.Array(ActiveNicheStackRecordSchema),
    agent_defaults: Type.Array(ActiveNicheAgentDefaultBindingSchema),
    route_overlays: Type.Array(ActiveNicheRouteOverlaySchema),
  },
  { additionalProperties: false },
);

export type ActiveNicheStackRecord = Static<typeof ActiveNicheStackRecordSchema>;
export type ActiveNicheAgentDefaultBinding = Static<typeof ActiveNicheAgentDefaultBindingSchema>;
export type ActiveNicheRouteOverlay = Static<typeof ActiveNicheRouteOverlaySchema>;
export type ActiveNicheRuntimeState = Static<typeof ActiveNicheRuntimeStateSchema>;
