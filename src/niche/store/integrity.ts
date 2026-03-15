import crypto from "node:crypto";

export function computeStoreRecordHash(data: unknown): string {
  const serialized = JSON.stringify(data, Object.keys(data as Record<string, unknown>).sort());
  return crypto.createHash("sha256").update(serialized, "utf-8").digest("hex");
}

export function wrapWithIntegrityEnvelope<T>(data: T): {
  data: T;
  integrity: { hash: string; algorithm: "sha256"; computed_at: string };
} {
  return {
    data,
    integrity: {
      hash: computeStoreRecordHash(data),
      algorithm: "sha256",
      computed_at: new Date().toISOString(),
    },
  };
}

export function verifyIntegrityEnvelope<T>(envelope: { data: T; integrity: { hash: string } }): {
  ok: boolean;
  expected: string;
  computed: string;
} {
  const computed = computeStoreRecordHash(envelope.data);
  return { ok: computed === envelope.integrity.hash, expected: envelope.integrity.hash, computed };
}
