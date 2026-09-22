export type RangeKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "custom"
  | "all";

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Bugün",
  yesterday: "Dün",
  this_week: "Bu hafta",
  last_week: "Geçen hafta",
  this_month: "Bu ay",
  last_month: "Geçen ay",
  this_year: "Bu yıl",
  last_year: "Geçen yıl",
  custom: "Özel tarih",
  all: "Tüm zamanlar",
};

const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;
const ROLLING_DAY_RANGES: Record<string, number> = {
  "7d": 7,
  last_7_days: 7,
  "30d": 30,
  last_30_days: 30,
  "90d": 90,
  last_90_days: 90,
};

function turkeyNowParts() {
  const turkeyNow = new Date(Date.now() + TURKEY_OFFSET_MS);
  return {
    year: turkeyNow.getUTCFullYear(),
    month: turkeyNow.getUTCMonth(),
    date: turkeyNow.getUTCDate(),
    day: turkeyNow.getUTCDay() || 7,
  };
}

function turkeyStartUtc(year: number, month: number, date: number) {
  return new Date(Date.UTC(year, month, date, 0, 0, 0, 0) - TURKEY_OFFSET_MS);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDateInput(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = turkeyStartUtc(year, month, day);
  const turkey = new Date(date.getTime() + TURKEY_OFFSET_MS);
  if (
    turkey.getUTCFullYear() !== year ||
    turkey.getUTCMonth() !== month ||
    turkey.getUTCDate() !== day
  ) return null;
  return date;
}

function normalizedRangeKey(value: string | null) {
  return String(value || "today").trim().toLocaleLowerCase("en-US");
}

export function getDateRange(
  key: string | null,
  customFrom?: string | null,
  customTo?: string | null,
) {
  const raw = normalizedRangeKey(key);
  const encodedCustom = raw.startsWith("custom:") ? raw.split(":") : null;
  const now = turkeyNowParts();
  const today = turkeyStartUtc(now.year, now.month, now.date);

  const rollingDays = ROLLING_DAY_RANGES[raw];
  if (rollingDays) {
    return {
      from: addDays(today, 1 - rollingDays),
      to: addDays(today, 1),
      key: "custom" as RangeKey,
      sourceKey: raw,
    };
  }

  const requested = (encodedCustom ? "custom" : raw) as RangeKey;
  const range: RangeKey = requested in RANGE_LABELS ? requested : "today";
  const effectiveFrom = encodedCustom?.[1] || customFrom || null;
  const effectiveTo = encodedCustom?.[2] || customTo || null;

  if (range === "all") return { from: null, to: null, key: range, sourceKey: raw };
  if (range === "custom") {
    const from = parseDateInput(effectiveFrom);
    const inclusiveTo = parseDateInput(effectiveTo);
    const to = inclusiveTo ? addDays(inclusiveTo, 1) : null;
    if (!from && !to) return { from: null, to: null, key: range, sourceKey: raw };
    if (from && to && from >= to) {
      return { from, to: addDays(from, 1), key: range, sourceKey: raw };
    }
    return { from, to, key: range, sourceKey: raw };
  }

  if (range === "today") return { from: today, to: addDays(today, 1), key: range, sourceKey: raw };
  if (range === "yesterday") return { from: addDays(today, -1), to: today, key: range, sourceKey: raw };

  const thisWeek = addDays(today, 1 - now.day);
  if (range === "this_week") return { from: thisWeek, to: addDays(thisWeek, 7), key: range, sourceKey: raw };
  if (range === "last_week") return { from: addDays(thisWeek, -7), to: thisWeek, key: range, sourceKey: raw };

  const thisMonth = turkeyStartUtc(now.year, now.month, 1);
  if (range === "this_month") {
    return { from: thisMonth, to: turkeyStartUtc(now.year, now.month + 1, 1), key: range, sourceKey: raw };
  }
  if (range === "last_month") {
    return { from: turkeyStartUtc(now.year, now.month - 1, 1), to: thisMonth, key: range, sourceKey: raw };
  }

  const thisYear = turkeyStartUtc(now.year, 0, 1);
  if (range === "this_year") {
    return { from: thisYear, to: turkeyStartUtc(now.year + 1, 0, 1), key: range, sourceKey: raw };
  }
  if (range === "last_year") {
    return { from: turkeyStartUtc(now.year - 1, 0, 1), to: thisYear, key: range, sourceKey: raw };
  }

  return { from: null, to: null, key: "all" as RangeKey, sourceKey: raw };
}

export function applyRange<
  T extends { gte: (...args: any[]) => T; lt: (...args: any[]) => T },
>(
  query: T,
  column: string,
  rangeKey: string | null,
  customFrom?: string | null,
  customTo?: string | null,
) {
  const range = getDateRange(rangeKey, customFrom, customTo);
  let next = query;
  if (range.from) next = next.gte(column, range.from.toISOString());
  if (range.to) next = next.lt(column, range.to.toISOString());
  return next;
}
