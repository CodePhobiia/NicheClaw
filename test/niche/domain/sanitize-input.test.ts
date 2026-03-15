import { describe, expect, it } from "vitest";
import {
  sanitizeNicheTextField,
  validateNicheTextField,
} from "../../../src/niche/domain/sanitize-input.js";

describe("sanitizeNicheTextField", () => {
  it("passes through normal text unchanged", () => {
    expect(sanitizeNicheTextField("hello world")).toBe("hello world");
  });

  it("strips NUL and other control chars", () => {
    expect(sanitizeNicheTextField("a\x00b\x01c\x1Fd")).toBe("abcd");
  });

  it("preserves tab, newline, and carriage return", () => {
    expect(sanitizeNicheTextField("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("strips C1 control chars (0x7F-0x9F)", () => {
    expect(sanitizeNicheTextField("a\x7Fb\x80c\x9Fd")).toBe("abcd");
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeNicheTextField("  hello  ")).toBe("hello");
  });

  it("truncates to maxLength", () => {
    const long = "a".repeat(20);
    expect(sanitizeNicheTextField(long, 10)).toBe("a".repeat(10));
  });

  it("returns empty string for control-only input", () => {
    expect(sanitizeNicheTextField("\x00\x01\x02")).toBe("");
  });
});

describe("validateNicheTextField", () => {
  it("returns ok for valid text", () => {
    const result = validateNicheTextField("valid text", "field");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized).toBe("valid text");
    }
  });

  it("returns failure for empty-after-sanitization text", () => {
    const result = validateNicheTextField("\x00\x01", "reason");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("reason");
      expect(result.reason).toContain("empty after sanitization");
    }
  });

  it("returns failure for whitespace-only text", () => {
    const result = validateNicheTextField("   ", "description");
    expect(result.ok).toBe(false);
  });

  it("sanitizes and returns the cleaned text", () => {
    const result = validateNicheTextField("  hello\x00world  ", "field");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized).toBe("helloworld");
    }
  });

  it("respects custom maxLength", () => {
    const result = validateNicheTextField("abcdefghij", "field", 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sanitized).toBe("abcde");
    }
  });
});
