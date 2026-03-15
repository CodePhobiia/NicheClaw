#!/usr/bin/env node
// Prints a summary of NicheClaw metrics from the local store.
import fs from "node:fs";
import path from "node:path";
import { getActiveNicheRuntimeState } from "../src/niche/store/active-stack-store.js";
import { listBenchmarkResultRecords } from "../src/niche/store/benchmark-run-store.js";
import { resolveNicheStoreRoots } from "../src/niche/store/paths.js";
import { listNichePrograms } from "../src/niche/store/program-store.js";
import { getStoreStatistics } from "../src/niche/store/pruning.js";

function main() {
  const env = process.env;

  console.log("NicheClaw Metrics Report\n");

  // Programs
  const programs = listNichePrograms(env);
  console.log(`Programs: ${programs.length}`);

  // Benchmarks
  const benchmarks = listBenchmarkResultRecords({ env });
  console.log(`Benchmark results: ${benchmarks.length}`);

  // Active stacks
  try {
    const state = getActiveNicheRuntimeState(env);
    const active = state.stacks.filter((s) => s.release_mode !== "rolled_back");
    console.log(`Active stacks: ${active.length}`);
    console.log(`Rolled back stacks: ${state.stacks.length - active.length}`);
  } catch {
    console.log("Active stacks: (no state file)");
  }

  // Store stats
  try {
    const stats = getStoreStatistics(env);
    console.log(`\nStore: ${stats.total_files} files, ${(stats.total_bytes / 1024).toFixed(1)} KB`);
  } catch {
    console.log("\nStore: (not initialized)");
  }

  // Feedback
  try {
    const feedbackDir = path.join(resolveNicheStoreRoots(env).root, "feedback");
    if (fs.existsSync(feedbackDir)) {
      const files = fs.readdirSync(feedbackDir).filter((f: string) => f.endsWith(".json"));
      console.log(`Feedback entries: ${files.length}`);
    }
  } catch {
    /* no feedback */
  }
}

main();
