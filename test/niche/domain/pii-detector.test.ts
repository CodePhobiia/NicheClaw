import { describe, expect, it } from "vitest";
import { detectPiiInText, redactPiiInText } from "../../../src/niche/domain/pii-detector.js";

describe("detectPiiInText", () => {
  it("returns no findings for clean text", () => {
    const result = detectPiiInText("This is a normal sentence with no PII.");
    expect(result.detected).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("detects email addresses", () => {
    const result = detectPiiInText("Contact alice@example.com for more info.");
    expect(result.detected).toBe(true);
    expect(result.findings).toContainEqual({ category: "email", count: 1 });
  });

  it("detects phone numbers", () => {
    const result = detectPiiInText("Call us at (555) 123-4567 or 555.987.6543.");
    expect(result.detected).toBe(true);
    const phone = result.findings.find((f) => f.category === "phone");
    expect(phone).toBeDefined();
    expect(phone!.count).toBeGreaterThanOrEqual(1);
  });

  it("detects SSN-like patterns", () => {
    const result = detectPiiInText("SSN: 123-45-6789");
    expect(result.detected).toBe(true);
    expect(result.findings.some((f) => f.category === "ssn")).toBe(true);
  });

  it("detects credit card patterns", () => {
    const result = detectPiiInText("Card: 4111-1111-1111-1111");
    expect(result.detected).toBe(true);
    expect(result.findings.some((f) => f.category === "credit_card")).toBe(true);
  });

  it("detects IP addresses", () => {
    const result = detectPiiInText("Server at 192.168.1.100");
    expect(result.detected).toBe(true);
    expect(result.findings.some((f) => f.category === "ip_address")).toBe(true);
  });

  it("detects multiple PII types in one string", () => {
    const result = detectPiiInText("Email: bob@test.com, IP: 10.0.0.1");
    expect(result.detected).toBe(true);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("redactPiiInText", () => {
  it("returns original text when no PII present", () => {
    const { redacted, redaction_count } = redactPiiInText("No personal data here.");
    expect(redacted).toBe("No personal data here.");
    expect(redaction_count).toBe(0);
  });

  it("redacts email addresses", () => {
    const { redacted, redaction_count } = redactPiiInText("Send to alice@example.com");
    expect(redacted).toContain("[REDACTED:email]");
    expect(redacted).not.toContain("alice@example.com");
    expect(redaction_count).toBeGreaterThanOrEqual(1);
  });

  it("redacts IP addresses", () => {
    const { redacted } = redactPiiInText("Connect to 192.168.1.1");
    expect(redacted).toContain("[REDACTED:ip_address]");
    expect(redacted).not.toContain("192.168.1.1");
  });

  it("counts all redactions", () => {
    const { redaction_count } = redactPiiInText("a@b.com and c@d.com and 10.0.0.1");
    expect(redaction_count).toBeGreaterThanOrEqual(3);
  });
});
