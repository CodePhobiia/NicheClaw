import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.unit.config.ts";

const base = baseConfig as unknown as Record<string, unknown>;
const baseTest = (baseConfig as { test?: { exclude?: string[]; include?: string[] } }).test ?? {};

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    include: ["test/niche/**/*.test.ts", "src/cli/program/register.niche*.test.ts"],
    exclude: baseTest.exclude ?? [],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/niche/**/*.ts"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});
