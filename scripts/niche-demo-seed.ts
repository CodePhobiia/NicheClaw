#!/usr/bin/env node
// Seeds a demo niche environment with pre-computed artifacts for walkthroughs.
import { nicheInitCommand } from "../src/commands/niche/init.js";

async function main() {
  console.log("Seeding NicheClaw demo environment...");

  // Step 1: Initialize with starter program
  await nicheInitCommand({
    writeStarterProgram: true,
    json: false,
  });

  console.log("\nDemo environment seeded.");
  console.log("Try these commands:");
  console.log("  openclaw niche list");
  console.log("  openclaw niche status");
  console.log("  openclaw niche readiness --niche-program-id repo-ci-specialist");
  console.log("  openclaw niche next --niche-program-id repo-ci-specialist");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
