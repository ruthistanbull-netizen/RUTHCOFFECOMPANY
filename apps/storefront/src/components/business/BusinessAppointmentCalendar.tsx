"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ruthMotion, ruthTransition } from "@ruth-commerce/ui/motion";
import { businessToday, formatBusinessDate, parseBusinessDate } from "@/lib/businessInquiry";
import styles from "./business-inquiry.module.css";

const WEEKDAYS = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const moveDays = (key: string, offset: number) => {
  const date = parseBusinessDate(key)!;
  date.setUTCDate(date.getUTCDate() + offset);
  return dateKey(date);
};
function monthDate(key: string) {
  const date = parseBusinessDate(key)!;
  date.setUTCDate(1);
  return date;
}
function moveMonths(key: string, offset: number) {
  const original = parseBusinessDate(key)!;
  const date = monthDate(key);
  date.setUTCMonth(date.getUTCMonth() + offset);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
  date.setUTCDate(Math.min(original.getUTCDate(), last));
  return dateKey(date);
}

export function BusinessAppointmentCalendar({ value, onChange, reduceMotion, id }: {
  value: string; onChange: (value: string) => void; reduceMotion: boolean; id: string;
}) {
  const [today, setToday] = useState(businessToday);
  const [month, setMonth] = useState(() => dateKey(monthDate(value || businessToday())));
  const [focusDay, setFocusDay] = useState(value || today);
  const [direction, setDirection] = useState(1);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const shouldFocusDay = useRef(false);
  useEffect(() => {
    if (shouldFocusDay.current) {
      dayRefs.current.get(focusDay)?.focus();
      shouldFocusDay.current = false;
    }
  }, [focusDay, month]);

  const start = monthDate(month);
  start.setUTCDate(1 - (start.getUTCDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, index) => moveDays(dateKey(start), index));
  const currentMonth = month.slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", month: "long" }).format(monthDate(month));
  const tabDay = focusDay.slice(0, 7) === currentMonth && focusDay >= today ? focusDay : days.find(day => day >= today && day.startsWith(currentMonth));

  function changeMonth(offset: number) {
    const next = dateKey(monthDate(moveMonths(month, offset)));
    setDirection(offset);
    setMonth(next);
    setFocusDay(next < today ? today : next);
  }

  function onDayKey(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    let target: string | undefined;
    if (event.key === "ArrowRight") target = moveDays(day, 1);
    if (event.key === "ArrowLeft") target = moveDays(day, -1);
    if (event.key === "ArrowDown") target = moveDays(day, 7);
    if (event.key === "ArrowUp") target = moveDays(day, -7);
    if (event.key === "Home") target = moveDays(day, -(parseBusinessDate(day)!.getUTCDay() + 6) % 7);
    if (event.key === "End") target = moveDays(day, 6 - (parseBusinessDate(day)!.getUTCDay() + 6) % 7);
    if (event.key === "PageDown") target = moveMonths(day, 1);
    if (event.key === "PageUp") target = moveMonths(day, -1);
    if (!target) return;
    event.preventDefault();
    if (target < today) target = today;
    const nextMonth = dateKey(monthDate(target));
    setDirection(target > day ? 1 : -1);
    shouldFocusDay.current = true;
    setFocusDay(target);
    setMonth(nextMonth);
  }

  return (
    <div id={id} className={styles.calendar} onFocus={() => setToday(businessToday())}>
      <div className={styles.calendarHeader}>
        <h4 className={`${styles.calendarMonth} font-display`} aria-live="polite">
          {monthLabel.toLocaleUpperCase("tr-TR")} <span>{month.slice(0, 4)}</span>
        </h4>
        <div className={styles.calendarArrows}>
          <button type="button" disabled={currentMonth <= today.slice(0, 7)} onClick={() => changeMonth(-1)} aria-label="Önceki ay"><ArrowLeft size={17} /></button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Sonraki ay"><ArrowRight size={17} /></button>
        </div>
      </div>
      <div className={styles.weekdays} aria-hidden="true">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
      <motion.div key={month} className={styles.calendarGrid} role="group" aria-label="Görüşme tarihi" initial={reduceMotion ? false : { opacity: .65, x: direction * ruthMotion.distance.subtle }} animate={{ opacity: 1, x: 0 }} transition={ruthTransition("fast")}>
        {days.map(day => {
          const outside = !day.startsWith(currentMonth);
          return <button
            key={day}
            ref={element => { if (element) dayRefs.current.set(day, element); else dayRefs.current.delete(day); }}
            type="button"
            disabled={day < today || outside}
            tabIndex={day === tabDay ? 0 : -1}
            data-outside={outside}
            data-selected={day === value}
            aria-current={day === today ? "date" : undefined}
            aria-pressed={day === value}
            aria-label={formatBusinessDate(day)}
            onKeyDown={event => onDayKey(event, day)}
            onClick={() => { setFocusDay(day); onChange(day); }}
          >{Number(day.slice(-2))}</button>;
        })}
      </motion.div>
      <div className={styles.dateSummary} aria-live="polite">
        <span>Seçilen tarih</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.strong key={`${month}:${value}`} initial={reduceMotion ? false : { opacity: 0, x: direction * ruthMotion.distance.subtle }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={ruthTransition("fast")}>
            {value ? formatBusinessDate(value) : "Görüşmek istediğin günü seç."}
          </motion.strong>
        </AnimatePresence>
      </div>
    </div>
  );
}
