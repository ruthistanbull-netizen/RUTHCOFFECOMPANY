/** Exact minor-unit conversion. Only formatting/chart coordinates may use Number. */
export function financeMinor(value: string): bigint {
  const match = /^(-?)(\d{1,14})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("Tutar en fazla iki ondalık basamak içermeli.");
  return (
    (BigInt(match[2]) * BigInt(100) + BigInt((match[3] || "").padEnd(2, "0"))) *
    (match[1] ? -BigInt(1) : BigInt(1))
  );
}
export function financeDecimal(value: bigint): string {
  const v = value < BigInt(0) ? -value : value;
  return `${value < BigInt(0) ? "-" : ""}${v / BigInt(100)}.${String(v % BigInt(100)).padStart(2, "0")}`;
}
export function financeAmount(value: unknown): string {
  return financeDecimal(financeMinor(String(value ?? "")));
}
export function financeDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error("Geçersiz tarih.");
  return value;
}
export function istanbulToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function financePeriod(
  preset: string,
  today = istanbulToday(),
): { from: string; to: string } {
  const base = new Date(`${today}T12:00:00Z`);
  const shift = (n: number) =>
    new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
  const month = (n: number, day = 1) =>
    new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + n, day, 12))
      .toISOString()
      .slice(0, 10);
  const year = base.getUTCFullYear();
  switch (preset) {
    case "yesterday":
      return { from: shift(-1), to: shift(-1) };
    case "7d":
      return { from: shift(-6), to: today };
    case "30d":
      return { from: shift(-29), to: today };
    case "week":
      return { from: shift(-((base.getUTCDay() + 6) % 7)), to: today };
    case "month":
      return { from: month(0), to: today };
    case "last_month":
      return { from: month(-1), to: month(0, 0) };
    case "3m":
      return { from: month(-2), to: today };
    case "year":
      return { from: `${year}-01-01`, to: today };
    case "last_year":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    default:
      return { from: today, to: today };
  }
}
export function financeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const financeActionPermission: Record<string, string> = {
  entry: "expense_create",
  payment: "pay",
  void: "void",
  cost: "expense_edit",
  category: "settings",
  account: "settings",
  transfer: "pay",
  budget: "settings",
  recurring: "settings",
  settings: "settings",
  reconcile: "pay",
  backfill: "settings",
  run: "settings",
  permission: "settings",
  returned: "expense_edit",
};

/** Strict statement format; quoted CSV fields and escaped quotes are accepted. */
export function financeBankCsv(text: string) {
  const lines: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = source.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && c === "\n") {
      row.push(cell.replace(/\r$/, ""));
      lines.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV içinde kapatılmamış tırnak var.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    lines.push(row);
  }
  const header = lines.shift()?.map((s) => s.trim().toLowerCase());
  if (
    !header ||
    ["date", "amount", "reference"].some((s) => !header.includes(s))
  )
    throw new Error(
      "CSV başlıkları: date;amount;reference;description olmalı.",
    );
  return lines
    .filter((r) => r.some(Boolean))
    .map((r) => {
      const item = Object.fromEntries(header.map((h, i) => [h, r[i] || ""]));
      return {
        date: financeDate(item.date),
        amount: financeAmount(item.amount),
        reference: item.reference,
        description: item.description || "",
      };
    });
}
