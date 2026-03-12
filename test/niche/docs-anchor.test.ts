import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NICHE_NAMESPACE,
  NICHE_STATE_DIRNAMES,
  NICHE_STATE_ROOT_DIRNAME,
} from "../../src/niche/index.js";

const PRD_URL = new URL("../../PRD.md", import.meta.url);
const ARCHITECTURE_URL = new URL("../../ARCHITECTURE.md", import.meta.url);
const NICHE_INDEX_URL = new URL("../../src/niche/index.ts", import.meta.url);

describe("NicheClaw docs anchors", () => {
  it("keeps the root architecture anchors present", () => {
    expect(existsSync(PRD_URL)).toBe(true);
    expect(existsSync(ARCHITECTURE_URL)).toBe(true);
    expect(existsSync(NICHE_INDEX_URL)).toBe(true);
  });

  it("keeps the PRD and architecture anchors substantive", () => {
    const prd = readFileSync(PRD_URL, "utf8");
    const architecture = readFileSync(ARCHITECTURE_URL, "utf8");

    expect(prd).toContain("# NicheClaw PRD");
    expect(prd).toContain("Supersedes: earlier NicheClaw drafts and notes");
    expect(prd).toContain("The central product object: the Niche Stack");

    expect(architecture).toContain("# NicheClaw Architecture");
    expect(architecture).toContain("## System planes");
    expect(architecture).toContain("## Semantic seams");
    expect(architecture).toContain("## Pilot niche: repo, terminal, and CI");
  });

  it("exports non-empty NicheClaw namespace constants", () => {
    expect(NICHE_NAMESPACE.length).toBeGreaterThan(0);
    expect(NICHE_STATE_ROOT_DIRNAME.length).toBeGreaterThan(0);

    for (const value of Object.values(NICHE_STATE_DIRNAMES)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
