#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hashFile = path.join(rootDir, "src/canvas-host/a2ui/.bundle.hash");
const outputFile = path.join(rootDir, "src/canvas-host/a2ui/a2ui.bundle.js");
const a2uiRendererDir = path.join(rootDir, "vendor/a2ui/renderers/lit");
const a2uiAppDir = path.join(rootDir, "apps/shared/OpenClawKit/Tools/CanvasA2UI");
const inputPaths = [
  path.join(rootDir, "package.json"),
  path.join(rootDir, "pnpm-lock.yaml"),
  a2uiRendererDir,
  a2uiAppDir,
];
const useShell = process.platform === "win32";
const pnpmCmd = useShell ? "pnpm" : "pnpm";

function onError() {
  console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
  console.error("If this persists, verify pnpm deps and try again.");
}

async function exists(pathname) {
  try {
    await fsp.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function walk(entryPath, files) {
  const st = await fsp.stat(entryPath);
  if (st.isDirectory()) {
    const entries = await fsp.readdir(entryPath);
    for (const entry of entries) {
      await walk(path.join(entryPath, entry), files);
    }
    return;
  }
  files.push(entryPath);
}

function normalizePath(pathname) {
  return pathname.split(path.sep).join("/");
}

async function computeHash() {
  const files = [];
  for (const input of inputPaths) {
    await walk(input, files);
  }
  files.sort((left, right) => normalizePath(left).localeCompare(normalizePath(right)));
  const hash = createHash("sha256");
  for (const filePath of files) {
    hash.update(normalizePath(path.relative(rootDir, filePath)));
    hash.update("\0");
    hash.update(await fsp.readFile(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: useShell,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}`));
    });
  });
}

async function main() {
  const hasRenderer = await exists(a2uiRendererDir);
  const hasApp = await exists(a2uiAppDir);

  if (!hasRenderer || !hasApp) {
    if (await exists(outputFile)) {
      console.log("A2UI sources missing; keeping prebuilt bundle.");
      return;
    }
    throw new Error(`A2UI sources missing and no prebuilt bundle found at: ${outputFile}`);
  }

  const currentHash = await computeHash();
  if ((await exists(hashFile)) && (await exists(outputFile))) {
    const previousHash = (await fsp.readFile(hashFile, "utf8")).trim();
    if (previousHash === currentHash) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  }

  await run(pnpmCmd, ["-s", "exec", "tsc", "-p", path.join(a2uiRendererDir, "tsconfig.json")]);
  await run(pnpmCmd, ["-s", "dlx", "rolldown", "-c", path.join(a2uiAppDir, "rolldown.config.mjs")]);

  await fsp.mkdir(path.dirname(hashFile), { recursive: true });
  await fsp.writeFile(hashFile, `${currentHash}\n`, "utf8");
}

main().catch((error) => {
  onError();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
