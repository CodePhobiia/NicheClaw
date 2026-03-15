import fs from "node:fs";
import { resolveNicheStoreRoots } from "./paths.js";

export type StoreStatistics = {
  subdirectories: Array<{ name: string; file_count: number; total_bytes: number }>;
  total_files: number;
  total_bytes: number;
};

export function getStoreStatistics(env: NodeJS.ProcessEnv = process.env): StoreStatistics {
  const roots = resolveNicheStoreRoots(env);
  const subdirs: StoreStatistics["subdirectories"] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const [name, dirPath] of Object.entries(roots)) {
    if (name === "root") continue;
    if (!fs.existsSync(dirPath)) {
      subdirs.push({ name, file_count: 0, total_bytes: 0 });
      continue;
    }
    let fileCount = 0;
    let dirBytes = 0;
    const scanDir = (p: string) => {
      for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          scanDir(`${p}/${entry.name}`);
          continue;
        }
        if (entry.isFile()) {
          fileCount++;
          try {
            dirBytes += fs.statSync(`${p}/${entry.name}`).size;
          } catch {
            /* skip */
          }
        }
      }
    };
    scanDir(dirPath);
    subdirs.push({ name, file_count: fileCount, total_bytes: dirBytes });
    totalFiles += fileCount;
    totalBytes += dirBytes;
  }

  return { subdirectories: subdirs, total_files: totalFiles, total_bytes: totalBytes };
}
