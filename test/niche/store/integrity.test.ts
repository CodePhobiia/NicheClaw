import { describe, expect, it } from "vitest";
import {
  computeStoreRecordHash,
  verifyIntegrityEnvelope,
  wrapWithIntegrityEnvelope,
} from "../../../src/niche/store/integrity.js";

describe("computeStoreRecordHash", () => {
  it("returns a hex sha256 hash", () => {
    const hash = computeStoreRecordHash({ a: 1, b: "hello" });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces the same hash for same data", () => {
    const data = { x: 42, y: "test" };
    expect(computeStoreRecordHash(data)).toBe(computeStoreRecordHash(data));
  });

  it("produces deterministic hash regardless of property insertion order", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(computeStoreRecordHash(a)).toBe(computeStoreRecordHash(b));
  });

  it("produces different hashes for different data", () => {
    const hash1 = computeStoreRecordHash({ a: 1 });
    const hash2 = computeStoreRecordHash({ a: 2 });
    expect(hash1).not.toBe(hash2);
  });
});

describe("wrapWithIntegrityEnvelope", () => {
  it("wraps data with hash, algorithm, and computed_at", () => {
    const envelope = wrapWithIntegrityEnvelope({ key: "value" });
    expect(envelope.data).toEqual({ key: "value" });
    expect(envelope.integrity.algorithm).toBe("sha256");
    expect(envelope.integrity.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.integrity.computed_at).toBeTruthy();
  });

  it("produces a verifiable envelope", () => {
    const envelope = wrapWithIntegrityEnvelope({ test: 123 });
    const result = verifyIntegrityEnvelope(envelope);
    expect(result.ok).toBe(true);
    expect(result.expected).toBe(result.computed);
  });
});

describe("verifyIntegrityEnvelope", () => {
  it("returns ok:true for untampered data", () => {
    const envelope = wrapWithIntegrityEnvelope({ name: "test" });
    const result = verifyIntegrityEnvelope(envelope);
    expect(result.ok).toBe(true);
  });

  it("returns ok:false for tampered data", () => {
    const envelope = wrapWithIntegrityEnvelope({ name: "test" });
    (envelope.data as Record<string, unknown>).name = "tampered";
    const result = verifyIntegrityEnvelope(envelope);
    expect(result.ok).toBe(false);
    expect(result.expected).not.toBe(result.computed);
  });

  it("returns ok:false for tampered hash", () => {
    const envelope = wrapWithIntegrityEnvelope({ name: "test" });
    envelope.integrity.hash = "0".repeat(64);
    const result = verifyIntegrityEnvelope(envelope);
    expect(result.ok).toBe(false);
  });
});
