import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveNicheStoreRoots } from "../../../src/niche/store/paths.js";
import { getStoreStatistics } from "../../../src/niche/store/pruning.js";
import { withTempHome } from "../../helpers/temp-home.js";

describe("getStoreStatistics", () => {
  it("returns zero counts when store does not exist", async () => {
    await withTempHome(async () => {
      const stats = getStoreStatistics(process.env);
      expect(stats.total_files).toBe(0);
      expect(stats.total_bytes).toBe(0);
      expect(stats.subdirectories.length).toBeGreaterThan(0);
      expect(stats.subdirectories.every((s) => s.file_count === 0)).toBe(true);
    });
  });

  it("counts files and bytes in subdirectories", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.programs, { recursive: true });
      fs.mkdirSync(roots.traces, { recursive: true });

      // Write test files into programs
      const content = JSON.stringify({ test: true });
      fs.writeFileSync(path.join(roots.programs, "prog-1.json"), content, "utf-8");
      fs.writeFileSync(path.join(roots.programs, "prog-2.json"), content, "utf-8");

      // Write a test file into traces
      fs.writeFileSync(path.join(roots.traces, "trace-1.json"), content, "utf-8");

      const stats = getStoreStatistics(process.env);
      expect(stats.total_files).toBe(3);
      expect(stats.total_bytes).toBeGreaterThan(0);

      const programsEntry = stats.subdirectories.find((s) => s.name === "programs");
      expect(programsEntry).toBeDefined();
      expect(programsEntry!.file_count).toBe(2);
      expect(programsEntry!.total_bytes).toBeGreaterThan(0);

      const tracesEntry = stats.subdirectories.find((s) => s.name === "traces");
      expect(tracesEntry).toBeDefined();
      expect(tracesEntry!.file_count).toBe(1);
    });
  });

  it("scans nested subdirectories", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      const nestedDir = path.join(roots.artifacts, "tool_schema", "v1");
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, "schema.json"), "{}", "utf-8");

      const stats = getStoreStatistics(process.env);
      const artifactsEntry = stats.subdirectories.find((s) => s.name === "artifacts");
      expect(artifactsEntry).toBeDefined();
      expect(artifactsEntry!.file_count).toBe(1);
    });
  });
});
