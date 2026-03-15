import { describe, expect, it } from "vitest";
import { validateCredentialAvailability } from "../../../src/niche/optimizer/credential-resolver.js";

describe("validateCredentialAvailability", () => {
  it("returns ok when all credentials are present", () => {
    const env = {
      OPENAI_API_KEY: "sk-xxx",
      ANTHROPIC_API_KEY: "ak-yyy",
    } as unknown as NodeJS.ProcessEnv;
    const result = validateCredentialAvailability({
      requiredCredentials: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
      env,
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("reports missing credentials", () => {
    const env = { OPENAI_API_KEY: "sk-xxx" } as unknown as NodeJS.ProcessEnv;
    const result = validateCredentialAvailability({
      requiredCredentials: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
      env,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("returns ok for empty required list", () => {
    const env = {} as unknown as NodeJS.ProcessEnv;
    const result = validateCredentialAvailability({
      requiredCredentials: [],
      env,
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("treats empty string as missing", () => {
    const env = { OPENAI_API_KEY: "" } as unknown as NodeJS.ProcessEnv;
    const result = validateCredentialAvailability({
      requiredCredentials: ["OPENAI_API_KEY"],
      env,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["OPENAI_API_KEY"]);
  });

  it("reports all missing when none are present", () => {
    const env = {} as unknown as NodeJS.ProcessEnv;
    const result = validateCredentialAvailability({
      requiredCredentials: ["A", "B", "C"],
      env,
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["A", "B", "C"]);
  });
});
