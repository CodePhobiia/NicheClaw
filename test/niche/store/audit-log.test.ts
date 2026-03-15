import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendAuditEntry,
  readAuditEntries,
  resolveAuditLogPath,
  type AuditLogEntry,
} from "../../../src/niche/store/audit-log.js";
import { withTempHome } from "../../../test/helpers/temp-home.js";

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    event_id: "evt-001",
    event_type: "lifecycle.run_started",
    occurred_at: "2026-03-14T10:00:00.000Z",
    actor: "system",
    niche_program_id: "test-program",
    run_id: "run-abc",
    payload_summary: "test payload",
    ...overrides,
  };
}

describe("audit-log", () => {
  it("resolves audit log path under the audit directory", async () => {
    await withTempHome(async () => {
      const logPath = resolveAuditLogPath(process.env);
      expect(logPath).toContain("audit");
      expect(logPath).toMatch(/audit\.jsonl$/);
    });
  });

  it("appends and reads entries", async () => {
    await withTempHome(async () => {
      const entry1 = makeEntry({ event_id: "evt-001" });
      const entry2 = makeEntry({ event_id: "evt-002", event_type: "lifecycle.run_completed" });
      appendAuditEntry(entry1, process.env);
      appendAuditEntry(entry2, process.env);

      const entries = readAuditEntries({ env: process.env });
      expect(entries).toHaveLength(2);
      expect(entries[0].event_id).toBe("evt-001");
      expect(entries[1].event_id).toBe("evt-002");
    });
  });

  it("creates the audit directory if missing", async () => {
    await withTempHome(async () => {
      const logPath = resolveAuditLogPath(process.env);
      expect(fs.existsSync(logPath)).toBe(false);
      appendAuditEntry(makeEntry(), process.env);
      expect(fs.existsSync(logPath)).toBe(true);
    });
  });

  it("returns empty array when no log file exists", async () => {
    await withTempHome(async () => {
      const entries = readAuditEntries({ env: process.env });
      expect(entries).toEqual([]);
    });
  });

  it("filters by eventType", async () => {
    await withTempHome(async () => {
      appendAuditEntry(
        makeEntry({ event_id: "e1", event_type: "lifecycle.run_started" }),
        process.env,
      );
      appendAuditEntry(
        makeEntry({ event_id: "e2", event_type: "lifecycle.run_completed" }),
        process.env,
      );
      appendAuditEntry(
        makeEntry({ event_id: "e3", event_type: "lifecycle.run_started" }),
        process.env,
      );

      const entries = readAuditEntries({ eventType: "lifecycle.run_started", env: process.env });
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.event_type === "lifecycle.run_started")).toBe(true);
    });
  });

  it("filters by nicheProgramId", async () => {
    await withTempHome(async () => {
      appendAuditEntry(makeEntry({ event_id: "e1", niche_program_id: "prog-a" }), process.env);
      appendAuditEntry(makeEntry({ event_id: "e2", niche_program_id: "prog-b" }), process.env);

      const entries = readAuditEntries({ nicheProgramId: "prog-a", env: process.env });
      expect(entries).toHaveLength(1);
      expect(entries[0].niche_program_id).toBe("prog-a");
    });
  });

  it("filters by since timestamp", async () => {
    await withTempHome(async () => {
      appendAuditEntry(
        makeEntry({ event_id: "e1", occurred_at: "2026-03-14T09:00:00.000Z" }),
        process.env,
      );
      appendAuditEntry(
        makeEntry({ event_id: "e2", occurred_at: "2026-03-14T11:00:00.000Z" }),
        process.env,
      );

      const entries = readAuditEntries({ since: "2026-03-14T10:00:00.000Z", env: process.env });
      expect(entries).toHaveLength(1);
      expect(entries[0].event_id).toBe("e2");
    });
  });

  it("limits results to last N entries", async () => {
    await withTempHome(async () => {
      appendAuditEntry(makeEntry({ event_id: "e1" }), process.env);
      appendAuditEntry(makeEntry({ event_id: "e2" }), process.env);
      appendAuditEntry(makeEntry({ event_id: "e3" }), process.env);

      const entries = readAuditEntries({ limit: 2, env: process.env });
      expect(entries).toHaveLength(2);
      expect(entries[0].event_id).toBe("e2");
      expect(entries[1].event_id).toBe("e3");
    });
  });
});
