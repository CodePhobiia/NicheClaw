#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const SCHEMA_DIR = "src/niche/schema";

function scanDir(dir) {
  const issues = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      issues.push(...scanDir(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.includes("Type.Any(")) {
        issues.push(fullPath);
      }
    }
  }
  return issues;
}

const issues = scanDir(SCHEMA_DIR);
if (issues.length > 0) {
  console.error("Type.Any() found in niche schema files:");
  for (const f of issues) console.error(`  ${f}`);
  process.exit(1);
}
console.log("No Type.Any() in niche schemas.");
