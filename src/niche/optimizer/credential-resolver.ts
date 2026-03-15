export function validateCredentialAvailability(params: {
  requiredCredentials: string[];
  env: NodeJS.ProcessEnv;
}): { ok: boolean; missing: string[] } {
  const missing = params.requiredCredentials.filter((name) => !params.env[name]);
  return { ok: missing.length === 0, missing };
}
