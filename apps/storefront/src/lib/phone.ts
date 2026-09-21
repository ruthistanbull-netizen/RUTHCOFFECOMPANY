export function normalizePhone(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";

  if (!digits) return "";

  if (digits.length === 12 && digits.startsWith("90")) {
    return `0${digits.slice(2)}`;
  }

  if (digits.length === 10 && digits.startsWith("5")) {
    return `0${digits}`;
  }

  return digits;
}

export function isValidPhone(value: unknown) {
  const normalized = normalizePhone(value);
  return normalized.length >= 10;
}
