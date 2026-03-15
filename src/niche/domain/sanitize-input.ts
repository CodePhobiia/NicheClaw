export function sanitizeNicheTextField(value: string, maxLength = 10_000): string {
  // Strip control chars except tab (0x09), newline (0x0A), carriage return (0x0D)
  const stripped = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu, "");
  const trimmed = stripped.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

export function validateNicheTextField(
  value: string,
  label: string,
  maxLength = 10_000,
): { ok: true; sanitized: string } | { ok: false; reason: string } {
  const sanitized = sanitizeNicheTextField(value, maxLength);
  if (sanitized.length === 0) {
    return { ok: false, reason: `${label} is empty after sanitization.` };
  }
  return { ok: true, sanitized };
}
