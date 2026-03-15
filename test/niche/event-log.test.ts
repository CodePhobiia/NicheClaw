import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appendNicheEventLog,
  readNicheEventLog,
  resolveNicheEventLogPath,
} from "../../src/niche/event-log.js";
import { resolveNicheStoreRoots } from "../../src/niche/store/paths.js";
import { withTempHome } from "../helpers/temp-home.js";

describe("niche event log", () => {
  it("returns empty array when log does not exist", async () => {
    await withTempHome(async () => {
      const entries = readNicheEventLog({ env: process.env });
      expect(entries).toEqual([]);
    });
  });

  it("appends and reads events", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.root, { recursive: true });

      const event1 = { event_type: "test_a", occurred_at: "2026-03-14T01:00:00.000Z" };
      const event2 = { event_type: "test_b", occurred_at: "2026-03-14T02:00:00.000Z" };

      appendNicheEventLog(event1, process.env);
      appendNicheEventLog(event2, process.env);

      const entries = readNicheEventLog({ env: process.env });
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual(event1);
      expect(entries[1]).toEqual(event2);
    });
  });

  it("filters by since parameter", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.root, { recursive: true });

      appendNicheEventLog(
        { event_type: "old", occurred_at: "2026-03-13T00:00:00.000Z" },
        process.env,
      );
      appendNicheEventLog(
        { event_type: "new", occurred_at: "2026-03-14T12:00:00.000Z" },
        process.env,
      );

      const entries = readNicheEventLog({
        since: "2026-03-14T00:00:00.000Z",
        env: process.env,
      });
      expect(entries).toHaveLength(1);
      expect((entries[0] as Record<string, unknown>).event_type).toBe("new");
    });
  });

  it("respects limit parameter (returns last N)", async () => {
    await withTempHome(async () => {
      const roots = resolveNicheStoreRoots(process.env);
      fs.mkdirSync(roots.root, { recursive: true });

      for (let i = 0; i < 5; i++) {
        appendNicheEventLog(
          { event_type: `evt_${i}`, occurred_at: `2026-03-14T0${i}:00:00.000Z` },
          process.env,
        );
      }

      const entries = readNicheEventLog({ limit: 2, env: process.env });
      expect(entries).toHaveLength(2);
      expect((entries[0] as Record<string, unknown>).event_type).toBe("evt_3");
      expect((entries[1] as Record<string, unknown>).event_type).toBe("evt_4");
    });
  });

  it("resolves the event log path inside the store root", async () => {
    await withTempHome(async () => {
      const logPath = resolveNicheEventLogPath(process.env);
      expect(logPath).toContain("event-log.jsonl");
    });
  });
});
