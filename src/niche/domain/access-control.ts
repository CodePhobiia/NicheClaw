import type { NicheProgram } from "../schema/index.js";

export function canAccessNicheProgram(params: {
  program: NicheProgram;
  clientId: string;
  scopes: string[];
  action: "read" | "write";
}): boolean {
  if (params.scopes.includes("operator.admin") || params.scopes.includes("niche.admin"))
    return true;
  if (!params.program.owner_id) return true; // legacy: open access
  if (params.program.owner_id === params.clientId) return true;
  const policy = params.program.access_policy;
  if (!policy) return params.program.owner_id === params.clientId;
  if (params.action === "read") {
    return policy.readers?.includes(params.clientId) ?? false;
  }
  return policy.writers?.includes(params.clientId) ?? false;
}
