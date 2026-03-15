import {
  importNicheBundle,
  importNicheBundleDryRun,
  type ImportBundleResult,
  type ImportDryRunResult,
} from "../../niche/store/portable-bundle.js";

export type NicheImportOptions = {
  bundleDir: string;
  dryRun: boolean;
  force: boolean;
  json: boolean;
};

export type NicheImportCommandResult = {
  dry_run: boolean;
  import_result: ImportBundleResult | null;
  dry_run_result: ImportDryRunResult | null;
};

export async function nicheImportCommand(
  opts: NicheImportOptions,
): Promise<NicheImportCommandResult> {
  if (opts.dryRun) {
    const dryRunResult = importNicheBundleDryRun({
      bundleDir: opts.bundleDir,
      env: process.env,
    });

    const result: NicheImportCommandResult = {
      dry_run: true,
      import_result: null,
      dry_run_result: dryRunResult,
    };

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    console.log(`\nNicheClaw Import — dry run\n`);
    console.log(`Bundle: ${opts.bundleDir}`);
    console.log(`\nWould import:`);
    console.log(`  Programs: ${dryRunResult.would_import.programs.length}`);
    console.log(`  Compilations: ${dryRunResult.would_import.compilations.length}`);
    console.log(`  Benchmarks: ${dryRunResult.would_import.benchmarks.length}`);
    console.log(`  Readiness: ${dryRunResult.would_import.readiness.length}`);
    console.log(`  Baselines: ${dryRunResult.would_import.baselines.length}`);
    console.log(`  Candidates: ${dryRunResult.would_import.candidates.length}`);
    console.log(`\nAlready exists:`);
    console.log(`  Programs: ${dryRunResult.already_exists.programs.length}`);
    console.log(`  Compilations: ${dryRunResult.already_exists.compilations.length}`);
    console.log(`  Benchmarks: ${dryRunResult.already_exists.benchmarks.length}`);

    return result;
  }

  const importResult = importNicheBundle({
    bundleDir: opts.bundleDir,
    force: opts.force,
    env: process.env,
  });

  const result: NicheImportCommandResult = {
    dry_run: false,
    import_result: importResult,
    dry_run_result: null,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log(`\nNicheClaw Import\n`);
  console.log(`Bundle: ${opts.bundleDir}`);
  console.log(`Imported programs: ${importResult.imported_programs}`);
  console.log(`Imported compilations: ${importResult.imported_compilations}`);
  console.log(`Imported readiness: ${importResult.imported_readiness}`);
  console.log(`Imported benchmarks: ${importResult.imported_benchmarks}`);
  console.log(`Imported manifests: ${importResult.imported_manifests}`);
  console.log(`Skipped duplicates: ${importResult.skipped_duplicates}`);
  if (importResult.errors.length > 0) {
    console.log(`Errors: ${importResult.errors.length}`);
    for (const err of importResult.errors) {
      console.log(`  ${err}`);
    }
  }

  return result;
}
