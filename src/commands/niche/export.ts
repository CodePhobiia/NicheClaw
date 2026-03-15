import { exportNicheBundle, type ExportBundleResult } from "../../niche/store/portable-bundle.js";

export type NicheExportOptions = {
  nicheProgramIds: string[];
  out: string;
  json: boolean;
};

export async function nicheExportCommand(opts: NicheExportOptions): Promise<ExportBundleResult> {
  if (opts.nicheProgramIds.length === 0) {
    throw new Error("At least one --niche-program-id is required.");
  }

  const result = exportNicheBundle({
    nicheProgramIds: opts.nicheProgramIds,
    outDir: opts.out,
    env: process.env,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log(`\nNicheClaw Export\n`);
  console.log(`Bundle: ${result.bundle_dir}`);
  console.log(`Programs: ${result.program_count}`);
  console.log(`Compilations: ${result.compilation_count}`);
  console.log(`Readiness reports: ${result.readiness_count}`);
  console.log(`Benchmark results: ${result.benchmark_count}`);
  console.log(`Manifests: ${result.manifest_count}`);
  console.log(`Total artifacts: ${result.manifest.artifact_count}`);

  return result;
}
