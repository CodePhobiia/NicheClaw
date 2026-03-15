import fs from "node:fs";
import path from "node:path";
import { resolveNicheStoreRoots, type NicheStoreRoots } from "../../niche/store/index.js";

export type VerifyIssue = {
  file: string;
  kind: "parse_error" | "orphan_tmp" | "orphan_lock";
  message: string;
};

export type NicheVerifyResult = {
  ok: boolean;
  errors: VerifyIssue[];
  warnings: VerifyIssue[];
  scanned_files: number;
};

function walkJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function collectStoreDirs(roots: NicheStoreRoots): string[] {
  return [
    roots.artifacts,
    roots.benchmarkRuns,
    roots.benchmarkSuites,
    roots.domainPacks,
    roots.graders,
    roots.jobs,
    roots.lineage,
    roots.manifests,
    roots.monitors,
    roots.programs,
    roots.readinessReports,
    roots.releases,
    roots.replayBundles,
    roots.traces,
  ];
}

export function nicheVerify(env: NodeJS.ProcessEnv = process.env): NicheVerifyResult {
  const roots = resolveNicheStoreRoots(env);
  const storeDirs = collectStoreDirs(roots);
  const errors: VerifyIssue[] = [];
  const warnings: VerifyIssue[] = [];
  let scannedFiles = 0;

  for (const dir of storeDirs) {
    const files = walkJsonFiles(dir);
    for (const filePath of files) {
      scannedFiles++;
      const ext = path.extname(filePath);
      const basename = path.basename(filePath);

      // Detect orphan .tmp files
      if (basename.endsWith(".tmp")) {
        warnings.push({
          file: filePath,
          kind: "orphan_tmp",
          message: `Orphan temporary file: ${basename}`,
        });
        continue;
      }

      // Detect orphan .lock files
      if (basename.endsWith(".lock")) {
        warnings.push({
          file: filePath,
          kind: "orphan_lock",
          message: `Orphan lock file: ${basename}`,
        });
        continue;
      }

      // Validate JSON files parse correctly
      if (ext === ".json") {
        try {
          const raw = fs.readFileSync(filePath, "utf8");
          JSON.parse(raw);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({
            file: filePath,
            kind: "parse_error",
            message: `Invalid JSON: ${msg}`,
          });
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    scanned_files: scannedFiles,
  };
}

export type NicheVerifyCommandOptions = {
  json: boolean;
};

export async function nicheVerifyCommand(
  opts: NicheVerifyCommandOptions,
): Promise<NicheVerifyResult> {
  const result = nicheVerify(process.env);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log(`\nNicheClaw Store Verify\n`);
  console.log(`Scanned: ${result.scanned_files} files`);
  console.log(`Errors:  ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const issue of result.errors) {
      console.log(`  [${issue.kind}] ${issue.file}`);
      console.log(`    ${issue.message}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`\nWarnings:`);
    for (const issue of result.warnings) {
      console.log(`  [${issue.kind}] ${issue.file}`);
      console.log(`    ${issue.message}`);
    }
  }

  if (result.ok) {
    console.log(`\nStore integrity: OK`);
  } else {
    console.log(`\nStore integrity: FAILED`);
  }

  return result;
}
