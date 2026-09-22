const MONEY_FIELD_PATTERN = /(^|_)(amount|price|revenue|turnover|refund|discount|tax|fee|cost|subtotal|grand_total|order_total|cart_total|net_total|ciro|tutar|fiyat|ucret|ücret)(_|$)/i;
const NON_MONEY_FIELD_PATTERN = /(^|_)(percent|percentage|rate|count|quantity|qty|adet|oran)(_|$)/i;
const TURKISH_LIRA_PATTERN = /(-?\d[\d.,\s]*)(?:\s*)(?:₺|TL|TRY)\b/gi;

export function normalizeRuthieSpeechData(value: unknown, key = "", depth = 0): unknown {
  if (depth > 8 || value == null) return value;

  if (typeof value === "number") {
    return isMoneyField(key) && Number.isFinite(value)
      ? formatTurkishLira(value)
      : value;
  }

  if (typeof value === "string") {
    const normalizedText = value.replace(TURKISH_LIRA_PATTERN, (match, raw: string) => {
      const parsed = parseTurkishMoney(raw);
      return parsed == null ? match : formatTurkishLira(parsed);
    });

    if (isMoneyField(key) && !/(?:₺|TL|TRY)\b/i.test(normalizedText)) {
      const parsed = parseTurkishMoney(normalizedText);
      if (parsed != null) return formatTurkishLira(parsed);
    }
    return normalizedText;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeRuthieSpeechData(item, key, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([nextKey, nextValue]) => [
          nextKey,
          normalizeRuthieSpeechData(nextValue, nextKey, depth + 1),
        ]),
    );
  }

  return value;
}

function isMoneyField(key: string): boolean {
  return MONEY_FIELD_PATTERN.test(key) && !NON_MONEY_FIELD_PATTERN.test(key);
}

function parseTurkishMoney(value: string): number | null {
  const raw = value.replace(/\s/g, "").replace(/(?:₺|TL|TRY)/gi, "");
  if (!raw || !/^-?[\d.,]+$/.test(raw)) return null;

  const sign = raw.startsWith("-") ? -1 : 1;
  const unsigned = raw.replace(/^-/, "");
  let normalized = unsigned;

  if (unsigned.includes(",")) {
    const parts = unsigned.split(",");
    const decimal = parts.pop() || "0";
    normalized = `${parts.join("").replace(/\./g, "")}.${decimal.replace(/\./g, "")}`;
  } else {
    const dotParts = unsigned.split(".");
    const lastLength = dotParts.at(-1)?.length || 0;
    if (dotParts.length > 2 && lastLength <= 2) {
      const decimal = dotParts.pop() || "0";
      normalized = `${dotParts.join("")}.${decimal}`;
    } else if (dotParts.length === 2 && dotParts[1].length <= 2) {
      normalized = `${dotParts[0]}.${dotParts[1]}`;
    } else {
      normalized = dotParts.join("");
    }
  }

  const parsed = Number(normalized) * sign;
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTurkishLira(value: number): string {
  return `${new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)} TL`;
}
