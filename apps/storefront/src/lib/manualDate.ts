export function formatManualDateInput(value: string) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return [day, month, year].filter(Boolean).join(".");
}

export function normalizeBirthDate(value: string): string | null {
  const clean = String(value || "").trim();
  let year: number;
  let month: number;
  let day: number;

  const canonical = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const manual = clean.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (canonical) {
    year = Number(canonical[1]);
    month = Number(canonical[2]);
    day = Number(canonical[3]);
  } else if (manual) {
    day = Number(manual[1]);
    month = Number(manual[2]);
    year = Number(manual[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const age = todayUtc.getUTCFullYear() - year;
  if (date > todayUtc || age < 0 || age >= 120) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function displayBirthDate(value?: string | null) {
  if (!value) return "";
  const canonical = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (canonical) return `${canonical[3]}.${canonical[2]}.${canonical[1]}`;
  return formatManualDateInput(String(value));
}
