export type PiiCategory = "email" | "phone" | "ssn" | "credit_card" | "ip_address";

export type PiiDetectionResult = {
  detected: boolean;
  findings: Array<{ category: PiiCategory; count: number }>;
};

const PATTERNS: Array<{ category: PiiCategory; regex: RegExp }> = [
  { category: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gu },
  { category: "phone", regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/gu },
  { category: "ssn", regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/gu },
  { category: "credit_card", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/gu },
  { category: "ip_address", regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu },
];

export function detectPiiInText(text: string): PiiDetectionResult {
  const findings: PiiDetectionResult["findings"] = [];
  for (const { category, regex } of PATTERNS) {
    const matches = text.match(new RegExp(regex.source, regex.flags));
    if (matches && matches.length > 0) {
      findings.push({ category, count: matches.length });
    }
  }
  return { detected: findings.length > 0, findings };
}

export function redactPiiInText(text: string): { redacted: string; redaction_count: number } {
  let count = 0;
  let result = text;
  for (const { category, regex } of PATTERNS) {
    result = result.replace(new RegExp(regex.source, regex.flags), () => {
      count++;
      return `[REDACTED:${category}]`;
    });
  }
  return { redacted: result, redaction_count: count };
}
