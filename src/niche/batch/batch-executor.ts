import { listNichePrograms } from "../store/index.js";

export type BatchProgramResult<T> = {
  niche_program_id: string;
  success: boolean;
  result: T | null;
  error: string | null;
};

export type BatchResult<T> = {
  results: BatchProgramResult<T>[];
  total: number;
  succeeded: number;
  failed: number;
};

export function listMatchingProgramIds(params: {
  programFilter?: string;
  env?: NodeJS.ProcessEnv;
}): string[] {
  const programs = listNichePrograms(params.env ?? process.env);
  const ids = programs.map((p) => p.niche_program_id);

  if (!params.programFilter) {
    return ids;
  }

  const filter = params.programFilter;
  if (filter.includes("*")) {
    const regex = new RegExp(`^${filter.replace(/\*/gu, ".*").replace(/\?/gu, ".")}$`, "u");
    return ids.filter((id) => regex.test(id));
  }

  return ids.filter((id) => id === filter);
}

export async function executeBatch<T>(params: {
  programIds: string[];
  concurrency?: number;
  executor: (nicheProgramId: string) => Promise<T>;
}): Promise<BatchResult<T>> {
  const concurrency = Math.min(Math.max(params.concurrency ?? 1, 1), 4);
  const results: BatchProgramResult<T>[] = [];

  if (concurrency === 1) {
    for (const programId of params.programIds) {
      try {
        const result = await params.executor(programId);
        results.push({
          niche_program_id: programId,
          success: true,
          result,
          error: null,
        });
      } catch (err) {
        results.push({
          niche_program_id: programId,
          success: false,
          result: null,
          error: String(err),
        });
      }
    }
  } else {
    // Simple concurrent execution with bounded parallelism
    const queue = [...params.programIds];
    const inFlight: Promise<void>[] = [];

    const processNext = async () => {
      while (queue.length > 0) {
        const programId = queue.shift()!;
        try {
          const result = await params.executor(programId);
          results.push({
            niche_program_id: programId,
            success: true,
            result,
            error: null,
          });
        } catch (err) {
          results.push({
            niche_program_id: programId,
            success: false,
            result: null,
            error: String(err),
          });
        }
      }
    };

    for (let i = 0; i < concurrency; i++) {
      inFlight.push(processNext());
    }
    await Promise.all(inFlight);
  }

  return {
    results: results.toSorted((a, b) => a.niche_program_id.localeCompare(b.niche_program_id)),
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
}
