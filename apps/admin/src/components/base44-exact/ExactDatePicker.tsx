"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

const DAY_LABELS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
const MONTH_LABELS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function parseDate(value?: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function labelFor(value: string) {
  const date = parseDate(value);
  return date
    ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(date)
    : "Tarih seç";
}

function monthDays(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1, 12);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0, 12).getDate();
  const previousCount = new Date(year, month, 0, 12).getDate();
  const cells: Array<{ date: Date; outside: boolean }> = [];
  for (let i = leading - 1; i >= 0; i -= 1) cells.push({ date: new Date(year, month - 1, previousCount - i, 12), outside: true });
  for (let day = 1; day <= count; day += 1) cells.push({ date: new Date(year, month, day, 12), outside: false });
  while (cells.length < 42) cells.push({ date: new Date(year, month + 1, cells.length - leading - count + 1, 12), outside: true });
  return cells;
}

function within(date: Date, min?: string, max?: string) {
  const minDate = parseDate(min);
  const maxDate = parseDate(max);
  const time = date.getTime();
  if (minDate && time < minDate.getTime()) return false;
  if (maxDate && time > maxDate.getTime()) return false;
  return true;
}

export function ExactDatePicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  label,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 80, width: 320 });
  const selected = parseDate(value);
  const [cursor, setCursor] = useState(() => selected || new Date());

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const isMobile = window.innerWidth < 768;
      setMobile(isMobile);
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || isMobile) return;
      const width = Math.min(340, Math.max(300, rect.width));
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
      const below = rect.bottom + 8;
      const estimatedHeight = 390;
      const top = below + estimatedHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - estimatedHeight - 8);
      setPosition({ left, top, width });
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const next = parseDate(value);
    if (next) setCursor(next);
  }, [open, value]);

  const days = useMemo(() => monthDays(cursor), [cursor]);
  const selectedValue = selected ? toValue(selected) : "";
  const todayValue = toValue(new Date());

  const choose = (date: Date) => {
    if (!within(date, min, max)) return;
    onChange(toValue(date));
    setOpen(false);
  };

  const calendar = (
    <motion.section
      role="dialog"
      aria-modal="true"
      aria-label={label ? `${label} tarih seçici` : "Tarih seçici"}
      data-admin-close-motion="native"
      initial={mobile ? { y: "100%", opacity: 0 } : { y: -8, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={mobile ? { y: "100%", opacity: 0 } : { y: -5, opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.72 }}
      className={mobile
        ? "fixed inset-x-0 bottom-0 z-[2147483647] rounded-t-[28px] border border-border-subtle bg-surface-primary px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 shadow-overlay"
        : "fixed z-[2147483647] rounded-2xl border border-border-subtle bg-surface-primary p-3 shadow-overlay"}
      style={mobile ? undefined : { left: position.left, top: position.top, width: position.width }}
    >
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong md:hidden" />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-surface-secondary" aria-label="Önceki ay"><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-center"><p className="ruth-type-card-title text-main">{MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}</p>{label ? <p className="ruth-type-caption text-subtle">{label}</p> : null}</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-surface-secondary" aria-label="Sonraki ay"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-surface-secondary" aria-label="Takvimi kapat"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((day) => <div key={day} className="ruth-type-caption grid h-7 place-items-center font-semibold text-subtle">{day}</div>)}
        {days.map(({ date, outside }) => {
          const dateValue = toValue(date);
          const isSelected = dateValue === selectedValue;
          const isToday = dateValue === todayValue;
          const allowed = within(date, min, max);
          return (
            <button
              key={dateValue}
              type="button"
              disabled={!allowed}
              onClick={() => choose(date)}
              className={`ruth-type-control relative grid h-9 place-items-center rounded-xl transition ${isSelected ? "bg-accent text-white shadow-sm" : isToday ? "bg-accent-soft text-accent" : outside ? "text-subtle/45 hover:bg-surface-secondary" : "text-main hover:bg-surface-secondary"} disabled:cursor-not-allowed disabled:opacity-25`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <button type="button" onClick={() => { const today = new Date(); if (within(today, min, max)) { onChange(toValue(today)); setCursor(today); setOpen(false); } }} className="ruth-type-control rounded-xl px-3 py-2 text-muted transition hover:bg-surface-secondary">Bugün</button>
        <span className="ruth-type-code text-main">{labelFor(value)}</span>
      </div>
    </motion.section>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`ruth-type-control box-border flex h-11 min-w-0 w-full max-w-full items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-secondary px-3 text-left text-main outline-none transition hover:border-border-strong focus:border-accent disabled:opacity-50 ${className}`}
      >
        <span className="min-w-0 truncate">{labelFor(value)}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {open ? (
            <div className="fixed inset-0 z-[2147483646]">
              <motion.button type="button" aria-label="Takvim arka planını kapat" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/10 md:bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} />
              {calendar}
            </div>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  );
}
