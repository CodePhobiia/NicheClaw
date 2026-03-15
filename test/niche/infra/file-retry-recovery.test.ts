import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { retryFileOp, tryRecoverCorruptedJsonFile } from "../../../src/infra/json-file.js";
import { withTempHome } from "../../helpers/temp-home.js";

describe("retryFileOp", () => {
  it("returns on first success without retries", () => {
    const result = retryFileOp(() => 42);
    expect(result).toBe(42);
  });

  it("retries on EBUSY and eventually succeeds", () => {
    let calls = 0;
    const result = retryFileOp(
      () => {
        calls++;
        if (calls < 3) {
          const err = new Error("EBUSY") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        }
        return "ok";
      },
      3,
      1,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("retries on EACCES errors", () => {
    let calls = 0;
    const result = retryFileOp(
      () => {
        calls++;
        if (calls < 2) {
          const err = new Error("EACCES") as NodeJS.ErrnoException;
          err.code = "EACCES";
          throw err;
        }
        return "recovered";
      },
      3,
      1,
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("throws immediately on non-retryable errors", () => {
    expect(() =>
      retryFileOp(() => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }),
    ).toThrow("ENOENT");
  });

  it("throws after exhausting all retries", () => {
    let calls = 0;
    expect(() =>
      retryFileOp(
        () => {
          calls++;
          const err = new Error("EBUSY") as NodeJS.ErrnoException;
          err.code = "EBUSY";
          throw err;
        },
        2,
        1,
      ),
    ).toThrow("EBUSY");
    // maxRetries=2 means attempts 0,1,2 = 3 total calls
    expect(calls).toBe(3);
  });

  it("throws immediately for errors without a code property", () => {
    expect(() =>
      retryFileOp(() => {
        throw new Error("generic error");
      }),
    ).toThrow("generic error");
  });
});

describe("tryRecoverCorruptedJsonFile", () => {
  it("recovers from a .tmp sidecar when the main file is corrupt", async () => {
    await withTempHome(async (home) => {
      const dir = path.join(home, "test-recover");
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "data.json");
      const tmpPath = filePath + ".tmp";

      // Write corrupt main file
      fs.writeFileSync(filePath, "not valid json{{{", "utf8");
      // Write valid tmp sidecar
      fs.writeFileSync(tmpPath, JSON.stringify({ recovered: true }), "utf8");

      const result = tryRecoverCorruptedJsonFile(filePath);
      expect(result).toEqual({ recovered: true });

      // The tmp file should have been renamed to the main path
      expect(fs.existsSync(tmpPath)).toBe(false);
      const finalContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
      expect(finalContent).toEqual({ recovered: true });
    });
  });

  it("moves the corrupt file to a backup when no .tmp sidecar exists", async () => {
    await withTempHome(async (home) => {
      const dir = path.join(home, "test-recover-no-tmp");
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "data.json");

      // Write corrupt main file
      fs.writeFileSync(filePath, "{corrupt", "utf8");

      const result = tryRecoverCorruptedJsonFile(filePath);
      expect(result).toBeUndefined();

      // The original file should be moved to a .corrupt.* backup
      expect(fs.existsSync(filePath)).toBe(false);
      const remainingFiles = fs.readdirSync(dir);
      const backupFile = remainingFiles.find((f) => f.includes(".corrupt."));
      expect(backupFile).toBeDefined();
    });
  });

  it("returns undefined when both main and .tmp are corrupt", async () => {
    await withTempHome(async (home) => {
      const dir = path.join(home, "test-recover-both-corrupt");
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "data.json");
      const tmpPath = filePath + ".tmp";

      fs.writeFileSync(filePath, "bad", "utf8");
      fs.writeFileSync(tmpPath, "also bad", "utf8");

      const result = tryRecoverCorruptedJsonFile(filePath);
      expect(result).toBeUndefined();
    });
  });

  it("returns undefined when the file does not exist and no .tmp", async () => {
    await withTempHome(async (home) => {
      const dir = path.join(home, "test-recover-missing");
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, "missing.json");

      const result = tryRecoverCorruptedJsonFile(filePath);
      expect(result).toBeUndefined();
    });
  });
});
