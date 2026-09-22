"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type PickerKind = "date" | "datetime-local" | "time" | "month";
type TrackedInput = HTMLInputElement & {
  _valueTracker?: { setValue: (value: string) => void };
};

const DATE_SELECTOR = 'input[type="date"], input[type="datetime-local"], input[type="time"], input[type="month"]';
const OPEN_GUARD_MS = 180;
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function kindOf(input: HTMLInputElement): PickerKind | null {
  const type = input.getAttribute("type");
  return type === "date" || type === "datetime-local" || type === "time" || type === "month"
    ? type
    : null;
}

function dateInputFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const input = target.closest<HTMLInputElement>(DATE_SELECTOR);
  return input && kindOf(input) ? input : null;
}

function parseValue(value: string, kind: PickerKind, fallback = new Date()) {
  const next = new Date(fallback);
  next.setSeconds(0, 0);

  if (kind === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  }

  if (kind === "datetime-local") {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (match) {
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        0,
        0,
      );
    }
  }

  if (kind === "time") {
    const match = /^(\d{2}):(\d{2})/.exec(value);
    if (match) next.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return next;
  }

  if (kind === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0, 0);
  }

  return next;
}

function formatValue(date: Date, kind: PickerKind) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());

  if (kind === "date") return `${year}-${month}-${day}`;
  if (kind === "datetime-local") return `${year}-${month}-${day}T${hour}:${minute}`;
  if (kind === "month") return `${year}-${month}`;
  return `${hour}:${minute}`;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function fieldLabel(input: HTMLInputElement) {
  const aria = input.getAttribute("aria-label");
  if (aria) return aria;
  if (input.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(input.id)}"]`);
    const text = label?.textContent?.trim();
    if (text) return text.replace(/\s*\*\s*$/, "");
  }
  const parentLabel = input.closest("label")?.textContent?.trim();
  return parentLabel?.replace(/\s*\*\s*$/, "") || input.name || "Tarih ve saat";
}

function setReactInputValue(input: TrackedInput, value: string) {
  const previous = input.value;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input._valueTracker?.setValue(previous);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function TimeUnit({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
}) {
  const update = (delta: number) => onChange((value + delta + max + 1) % (max + 1));
  return (
    <div data-ruth-liquid-time-unit>
      <button type="button" aria-label={`${label} azalt`} onClick={() => update(-1)}>
        <Minus aria-hidden="true" />
      </button>
      <div>
        <strong>{pad(value)}</strong>
        <span>{label}</span>
      </div>
      <button type="button" aria-label={`${label} artır`} onClick={() => update(1)}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

export function ExactDateTimeEnhancer() {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<PickerKind>("date");
  const [draft, setDraft] = useState<Date>(() => new Date());
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date());
  const [monthDirection, setMonthDirection] = useState(1);
  const openedAtRef = useRef(0);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const suppressNextCalendarClick = useRef(false);

  const close = useCallback(() => {
    setInput(null);
  }, []);

  const open = useCallback((target: HTMLInputElement) => {
    const nextKind = kindOf(target);
    if (!nextKind || target.disabled || target.readOnly) return;
    const nextDraft = parseValue(target.value, nextKind);
    openedAtRef.current = performance.now();
    suppressNextCalendarClick.current = false;
    setKind(nextKind);
    setDraft(nextDraft);
    setViewMonth(new Date(nextDraft.getFullYear(), nextDraft.getMonth(), 1));
    setMonthDirection(1);
    setInput(target);
  }, []);

  const choiceReady = useCallback(() => performance.now() - openedAtRef.current >= OPEN_GUARD_MS, []);

  useEffect(() => {
    const preventNativeAndOpen = (event: Event) => {
      const target = dateInputFromTarget(event.target);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      open(target);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = dateInputFromTarget(event.target);
      if (!target || !["Enter", " ", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      open(target);
    };

    // Mobile picker must open on the completed click only. Opening on touchstart
    // lets the newly mounted calendar land under the same finger and choose a value.
    document.addEventListener("click", preventNativeAndOpen, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("click", preventNativeAndOpen, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!input) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, input]);

  const calendarDays = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1, 12);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset, 12);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  const minimum = useMemo(() => input?.min ? parseValue(input.min, kind) : null, [input, kind]);
  const maximum = useMemo(() => input?.max ? parseValue(input.max, kind) : null, [input, kind]);

  const dayAllowed = useCallback((date: Date) => {
    if (minimum) {
      const threshold = kind === "datetime-local" ? endOfDay(date) : startOfDay(date);
      const minimumTime = kind === "month"
        ? new Date(minimum.getFullYear(), minimum.getMonth(), 1).getTime()
        : minimum.getTime();
      if (threshold < minimumTime) return false;
    }
    if (maximum) {
      const threshold = kind === "datetime-local" ? startOfDay(date) : startOfDay(date);
      const maximumTime = kind === "month"
        ? new Date(maximum.getFullYear(), maximum.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
        : maximum.getTime();
      if (threshold > maximumTime) return false;
    }
    return true;
  }, [kind, maximum, minimum]);

  const moveMonth = (delta: number) => {
    setMonthDirection(delta >= 0 ? 1 : -1);
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const selectDay = (date: Date) => {
    if (!choiceReady()) return;
    if (suppressNextCalendarClick.current) {
      suppressNextCalendarClick.current = false;
      return;
    }
    if (!dayAllowed(date)) return;
    setDraft((current) => new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      current.getHours(),
      current.getMinutes(),
      0,
      0,
    ));
    if (date.getMonth() !== viewMonth.getMonth() || date.getFullYear() !== viewMonth.getFullYear()) {
      setMonthDirection(date < viewMonth ? -1 : 1);
      setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const selectMonth = (month: number) => {
    if (!choiceReady()) return;
    setDraft((current) => new Date(viewMonth.getFullYear(), month, 1, current.getHours(), current.getMinutes()));
    setViewMonth((current) => new Date(current.getFullYear(), month, 1));
  };

  const setTime = (hours: number, minutes: number) => {
    if (!choiceReady()) return;
    setDraft((current) => new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
      hours,
      minutes,
      0,
      0,
    ));
  };

  const apply = () => {
    if (!input) return;
    let valueDate = draft;
    if (minimum && valueDate < minimum) valueDate = minimum;
    if (maximum && valueDate > maximum) valueDate = maximum;
    setReactInputValue(input as TrackedInput, formatValue(valueDate, kind));
    input.blur();
    close();
  };

  const chooseToday = () => {
    if (!choiceReady()) return;
    const today = new Date();
    setDraft(today);
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const onCalendarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeStartX.current = event.clientX;
    swipeStartY.current = event.clientY;
    suppressNextCalendarClick.current = false;
  };

  const onCalendarPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const deltaX = event.clientX - swipeStartX.current;
    const deltaY = event.clientY - swipeStartY.current;
    swipeStartX.current = null;
    swipeStartY.current = null;
    if (Math.hypot(deltaX, deltaY) > 10) suppressNextCalendarClick.current = true;
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    moveMonth(deltaX < 0 ? 1 : -1);
  };

  if (typeof document === "undefined") return null;

  const showsCalendar = kind !== "time";
  const showsTime = kind === "time" || kind === "datetime-local";
  const monthKey = `${viewMonth.getFullYear()}-${viewMonth.getMonth()}`;

  return createPortal(
    <AnimatePresence>
      {input ? (
        <div className="fixed inset-0 z-[132]" data-ruth-liquid-date-layer>
          <motion.button
            type="button"
            aria-label="Tarih seçiciyi kapat"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />

          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={fieldLabel(input)}
            data-ruth-liquid-date-panel
            initial={{ opacity: 0, y: 34, scale: 0.94, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 24, scale: 0.96, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.78 }}
          >
            <header data-ruth-liquid-date-header>
              <div>
                <span>{showsTime && !showsCalendar ? <Clock3 /> : <CalendarDays />}</span>
                <div>
                  <p>{fieldLabel(input)}</p>
                  <small>{new Intl.DateTimeFormat("tr-TR", {
                    ...(showsCalendar ? { day: kind === "month" ? undefined : "2-digit", month: "long", year: "numeric" } : {}),
                    ...(showsTime ? { hour: "2-digit", minute: "2-digit" } : {}),
                  }).format(draft)}</small>
                </div>
              </div>
              <button type="button" aria-label="Kapat" onClick={close}><X /></button>
            </header>

            {showsCalendar ? (
              <div data-ruth-liquid-calendar>
                <div data-ruth-liquid-calendar-toolbar>
                  <button type="button" aria-label="Önceki ay" onClick={() => moveMonth(-1)}><ChevronLeft /></button>
                  <strong>{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</strong>
                  <button type="button" aria-label="Sonraki ay" onClick={() => moveMonth(1)}><ChevronRight /></button>
                </div>

                {kind === "month" ? (
                  <div data-ruth-liquid-month-grid>
                    {MONTHS.map((month, index) => {
                      const active = draft.getFullYear() === viewMonth.getFullYear() && draft.getMonth() === index;
                      return (
                        <button
                          key={month}
                          type="button"
                          aria-pressed={active}
                          onClick={() => selectMonth(index)}
                        >
                          {active ? <motion.span layoutId="ruth-liquid-month-lens" data-ruth-liquid-calendar-lens /> : null}
                          <span>{month.slice(0, 3)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <div data-ruth-liquid-weekdays>
                      {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
                    </div>
                    <div
                      data-ruth-liquid-calendar-viewport
                      onPointerDown={onCalendarPointerDown}
                      onPointerUp={onCalendarPointerUp}
                      onPointerCancel={() => {
                        swipeStartX.current = null;
                        swipeStartY.current = null;
                        suppressNextCalendarClick.current = true;
                      }}
                    >
                      <AnimatePresence initial={false} custom={monthDirection} mode="wait">
                        <motion.div
                          key={monthKey}
                          custom={monthDirection}
                          initial={{ opacity: 0, x: monthDirection * 28, filter: "blur(6px)" }}
                          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                          exit={{ opacity: 0, x: monthDirection * -28, filter: "blur(6px)" }}
                          transition={{ type: "spring", stiffness: 390, damping: 34, mass: 0.72 }}
                          data-ruth-liquid-days-grid
                        >
                          {calendarDays.map((date) => {
                            const selected = sameDay(date, draft);
                            const today = sameDay(date, new Date());
                            const outside = date.getMonth() !== viewMonth.getMonth();
                            const allowed = dayAllowed(date);
                            return (
                              <button
                                key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                                type="button"
                                disabled={!allowed}
                                aria-pressed={selected}
                                data-outside={outside ? "true" : "false"}
                                data-today={today ? "true" : "false"}
                                onClick={() => selectDay(date)}
                              >
                                {selected ? <motion.span layoutId="ruth-liquid-day-lens" data-ruth-liquid-calendar-lens /> : null}
                                <span>{date.getDate()}</span>
                                {today && !selected ? <i /> : null}
                              </button>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {showsTime ? (
              <div data-ruth-liquid-time-picker>
                <TimeUnit
                  label="Saat"
                  value={draft.getHours()}
                  max={23}
                  onChange={(hours) => setTime(hours, draft.getMinutes())}
                />
                <span>:</span>
                <TimeUnit
                  label="Dakika"
                  value={draft.getMinutes()}
                  max={59}
                  onChange={(minutes) => setTime(draft.getHours(), minutes)}
                />
              </div>
            ) : null}

            <footer data-ruth-liquid-date-footer>
              <button type="button" onClick={chooseToday}>Bugün</button>
              <div>
                <button type="button" onClick={close}>Vazgeç</button>
                <button type="button" onClick={apply}><Check /> Uygula</button>
              </div>
            </footer>
          </motion.section>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
