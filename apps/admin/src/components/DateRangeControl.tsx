"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useMemo, useRef } from "react";

export type AdminDateRangeKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "last_year"
  | "all"
  | "custom";

export type AdminDateRangeValue = { range: AdminDateRangeKey; from: string; to: string };

export const ADMIN_DATE_RANGE_OPTIONS: Array<{ value: AdminDateRangeKey; label: string }> = [
  { value: "today", label: "Bugün" },
  { value: "yesterday", label: "Dün" },
  { value: "this_week", label: "Bu hafta" },
  { value: "last_week", label: "Geçen hafta" },
  { value: "this_month", label: "Bu ay" },
  { value: "last_month", label: "Geçen ay" },
  { value: "this_year", label: "Bu yıl" },
  { value: "last_year", label: "Geçen yıl" },
  { value: "all", label: "Tüm zamanlar" },
  { value: "custom", label: "Özel tarih" },
];

export function dateRangeParam(value: AdminDateRangeValue) {
  return value.range === "custom" ? `custom:${value.from || ""}:${value.to || ""}` : value.range;
}

export function DateRangeControl({ value, onChange, compact = false }: { value: AdminDateRangeValue; onChange: (next: AdminDateRangeValue) => void; compact?: boolean }) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const selectedLabel = useMemo(
    () => ADMIN_DATE_RANGE_OPTIONS.find((option) => option.value === value.range)?.label || "Tarih seç",
    [value.range],
  );

  const openPicker = () => {
    const select = selectRef.current;
    if (!select) return;
    document.dispatchEvent(new CustomEvent("ruth-admin-select-open", {
      detail: { select },
      cancelable: true,
    }));
  };

  return (
    <div className={`cr-date-range ${compact ? "is-compact" : ""}`}>
      <div className="cr-date-range__preset">
        <CalendarDays aria-hidden="true" />
        <span>Tarih</span>
        <button
          type="button"
          className="cr-date-range__trigger"
          aria-label="Tarih aralığı"
          aria-haspopup="dialog"
          onClick={openPicker}
        >
          <span>{selectedLabel}</span>
          <ChevronDown aria-hidden="true" />
        </button>
        <select
          ref={selectRef}
          data-admin-select-popup="true"
          data-admin-select-native-blocked="true"
          className="cr-date-range__native-select"
          aria-label="Tarih aralığı"
          tabIndex={-1}
          value={value.range}
          onChange={(event) => onChange({ ...value, range: event.target.value as AdminDateRangeKey })}
        >
          {ADMIN_DATE_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {value.range === "custom" ? <div className="cr-date-range__custom">
        <label><span>Başlangıç</span><input type="date" value={value.from} onChange={(event) => onChange({ ...value, from: event.target.value })} /></label>
        <span aria-hidden="true">—</span>
        <label><span>Bitiş</span><input type="date" value={value.to} min={value.from || undefined} onChange={(event) => onChange({ ...value, to: event.target.value })} /></label>
      </div> : null}
    </div>
  );
}
