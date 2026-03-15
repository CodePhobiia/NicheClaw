import {
  executeGarbageCollection,
  planGarbageCollection,
  type GcPlan,
  type GcResult,
} from "../../niche/store/gc-collector.js";

export type NicheGcOptions = {
  execute: boolean;
  keepLast?: number;
  keepDays?: number;
  json: boolean;
};

export type NicheGcCommandResult = {
  plan: {
    candidate_count: number;
    total_size_bytes: number;
    protected_count: number;
    scanned_files: number;
  };
  execution: {
    deleted_count: number;
    freed_bytes: number;
    error_count: number;
  } | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function nicheGcCommand(opts: NicheGcOptions): Promise<NicheGcCommandResult> {
  const plan = planGarbageCollection({
    keepLast: opts.keepLast,
    keepDays: opts.keepDays,
    env: process.env,
  });

  const result: NicheGcCommandResult = {
    plan: {
      candidate_count: plan.candidates.length,
      total_size_bytes: plan.total_size_bytes,
      protected_count: plan.protected_artifact_ids.size,
      scanned_files: plan.scanned_files,
    },
    execution: null,
  };

  if (!opts.execute) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            ...result,
            candidates: plan.candidates.map((c) => ({
              file_path: c.file_path,
              store_root: c.store_root,
              size_bytes: c.size_bytes,
              artifact_id: c.artifact_id,
              created_at: c.created_at,
            })),
          },
          null,
          2,
        ),
      );
      return result;
    }

    console.log(`\nNicheClaw GC — dry run\n`);
    console.log(`Scanned: ${plan.scanned_files} files`);
    console.log(`Protected: ${plan.protected_artifact_ids.size} artifact IDs`);
    console.log(
      `Candidates for deletion: ${plan.candidates.length} (${formatBytes(plan.total_size_bytes)})`,
    );

    if (plan.candidates.length > 0) {
      console.log();
      for (const c of plan.candidates.slice(0, 20)) {
        console.log(
          `  ${c.store_root.padEnd(16)} ${c.artifact_id}  (${formatBytes(c.size_bytes)})`,
        );
      }
      if (plan.candidates.length > 20) {
        console.log(`  ... and ${plan.candidates.length - 20} more`);
      }
      console.log(`\nRun with --execute to delete these files.`);
    }

    return result;
  }

  const gcResult = executeGarbageCollection(plan);
  result.execution = {
    deleted_count: gcResult.deleted.length,
    freed_bytes: gcResult.total_freed_bytes,
    error_count: gcResult.errors.length,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  console.log(`\nNicheClaw GC — executed\n`);
  console.log(
    `Deleted: ${gcResult.deleted.length} files (${formatBytes(gcResult.total_freed_bytes)})`,
  );
  if (gcResult.errors.length > 0) {
    console.log(`Errors: ${gcResult.errors.length}`);
    for (const err of gcResult.errors) {
      console.log(`  ${err.file_path}: ${err.error}`);
    }
  }

  return result;
}
