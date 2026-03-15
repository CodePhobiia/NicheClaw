import type { Static } from "@sinclair/typebox";
import { stringEnum } from "./common.js";

export const NICHE_STACK_RESOLUTION_SOURCES = [
  "session_override",
  "route_override",
  "agent_default",
] as const;

export const NICHE_STACK_RELEASE_MODES = ["shadow", "canary", "live", "rolled_back"] as const;

export const NicheStackResolutionSourceSchema = stringEnum(NICHE_STACK_RESOLUTION_SOURCES);

export const NicheStackReleaseModeSchema = stringEnum(NICHE_STACK_RELEASE_MODES);

export type NicheStackResolutionSource = Static<typeof NicheStackResolutionSourceSchema>;

export type NicheStackReleaseMode = Static<typeof NicheStackReleaseModeSchema>;
