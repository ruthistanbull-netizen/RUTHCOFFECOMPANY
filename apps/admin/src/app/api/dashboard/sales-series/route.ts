import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDateRange } from "@/lib/ranges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ISTANBUL_TIME_ZONE = "Europe/Istanbul";
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const METRIC_LABELS = {
  sales: "Net Satış",
  sessions: "Oturum",
  carts: "Sepet",
} as const;

const PERIOD_LABELS = {
  daily: "Günlük",
  weekly: "Haftalık",
  monthly: "Aylık",
  yearly: "Yıllık",
} as const;

const PERIOD_RANGES = {
  daily: "today",
  weekly: "this_week",
  monthly: "this_month",
  yearly: "this_year",
} as const;

type MetricKey = keyof typeof METRIC_LABELS;
type PeriodKey = keyof typeof PERIOD_LABELS;

type SalesOrder = {
  id: string;
  total_amount?: number | string | null;
  status?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  imported_source?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
};

type AnalyticsEvent = {
  session_id?: string | null;
  event_name?: string | null;
  created_at?: string | null;
};

type RefundRow = {
  order_id?: string | null;
  amount_kurus?: number | string | null;
};

type Bucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paid(order: SalesOrder) {
  const payment = String(order.payment_status || "").toLocaleLowerCase("tr-TR");
  const status = String(order.status || "").toLocaleLowerCase("tr-TR");
  return ["paid", "succeeded", "success"].includes(payment) || ["paid", "completed"].includes(status);
}

function testOrder(order: SalesOrder) {
  const source = String(order.imported_source || "").trim().toLocaleLowerCase("tr-TR");
  const note = `${String(order.customer_note || "")} ${String(order.admin_note || "")}`.toLocaleLowerCase("tr-TR");
  return source === "test" || source.includes("sandbox") || source.includes("demo") || note.includes("test sipariş") || note.includes("test siparis");
}

function istanbulParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const shifted = new Date(date.getTime() + ISTANBUL_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

function istanbulStart(year: number, month: number, date: number, hour = 0) {
  return new Date(Date.UTC(year, month, date, hour, 0, 0, 0) - ISTANBUL_OFFSET_MS);
}

function hourKey(value: Date | string) {
  const parts = istanbulParts(value);
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.date).padStart(2, "0")}-${String(parts.hour).padStart(2, "0")}`;
}

function dayKey(value: Date | string) {
  const parts = istanbulParts(value);
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.date).padStart(2, "0")}`;
}

function monthKey(value: Date | string) {
  const parts = istanbulParts(value);
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}`;
}

function hourLabel(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: ISTANBUL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dayLabel(date: Date, includeWeekday: boolean) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: ISTANBUL_TIME_ZONE,
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    day: "2-digit",
    month: "short",
  }).format(date);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: ISTANBUL_TIME_ZONE,
    month: "short",
  }).format(date);
}

function hourlyBuckets(from: Date, to: Date) {
  const buckets: Bucket[] = [];
  let cursor = new Date(from);
  while (cursor < to && buckets.length < 24) {
    const end = new Date(cursor.getTime() + HOUR_MS);
    buckets.push({ key: hourKey(cursor), label: hourLabel(cursor), start: cursor, end });
    cursor = end;
  }
  return buckets;
}

function dailyBuckets(from: Date, to: Date, includeWeekday: boolean) {
  const buckets: Bucket[] = [];
  let cursor = new Date(from);
  while (cursor < to && buckets.length < 40) {
    const end = new Date(cursor.getTime() + DAY_MS);
    buckets.push({ key: dayKey(cursor), label: dayLabel(cursor, includeWeekday), start: cursor, end });
    cursor = end;
  }
  return buckets;
}

function monthlyBuckets(from: Date, to: Date) {
  const buckets: Bucket[] = [];
  const first = istanbulParts(from);
  let cursor = istanbulStart(first.year, first.month, 1);
  while (cursor < to && buckets.length < 12) {
    const parts = istanbulParts(cursor);
    const end = istanbulStart(parts.year, parts.month + 1, 1);
    buckets.push({ key: monthKey(cursor), label: monthLabel(cursor), start: cursor, end });
    cursor = end;
  }
  return buckets;
}

function buildBuckets(period: PeriodKey, from: Date, to: Date) {
  if (period === "daily") return hourlyBuckets(from, to);
  if (period === "yearly") return monthlyBuckets(from, to);
  return dailyBuckets(from, to, period === "weekly");
}

function keyForPeriod(period: PeriodKey, value: Date | string) {
  if (period === "daily") return hourKey(value);
  if (period === "yearly") return monthKey(value);
  return dayKey(value);
}

function validMetric(value: string | null): MetricKey {
  return value === "sessions" || value === "carts" ? value : "sales";
}

function validPeriod(value: string | null): PeriodKey {
  return value === "daily" || value === "monthly" || value === "yearly" ? value : "weekly";
}

async function successfulRefundsForOrders(supabase: any, orderIds: string[]) {
  const rows: RefundRow[] = [];
  for (let offset = 0; offset < orderIds.length; offset += 200) {
    const chunk = orderIds.slice(offset, offset + 200);
    const result = await supabase
      .from("payment_refunds")
      .select("order_id,amount_kurus")
      .in("order_id", chunk)
      .in("status", ["succeeded", "success", "completed", "refunded"]);
    if (result.error) throw new Error(result.error.message);
    rows.push(...((result.data || []) as RefundRow[]));
  }
  return rows;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const url = new URL(request.url);
    const metric = validMetric(url.searchParams.get("metric"));
    const period = validPeriod(url.searchParams.get("period"));
    const bounds = getDateRange(PERIOD_RANGES[period]);
    const from = bounds.from;
    const to = bounds.to;

    if (!from || !to) throw new Error("Grafik tarih aralığı oluşturulamadı.");

    const buckets = buildBuckets(period, from, to);

    if (metric === "sales") {
      const result = await auth.supabase
        .from("orders")
        .select("id,total_amount,status,payment_status,created_at,imported_source,customer_note,admin_note")
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .order("created_at", { ascending: true });

      if (result.error) throw new Error(result.error.message);

      const paidOrders = ((result.data || []) as SalesOrder[]).filter((order) => order.created_at && !testOrder(order) && paid(order));
      const refunds = await successfulRefundsForOrders(auth.supabase, paidOrders.map((order) => String(order.id)));
      const refundsByOrderId = new Map<string, number>();
      for (const refund of refunds) {
        const orderId = String(refund.order_id || "");
        if (!orderId) continue;
        refundsByOrderId.set(orderId, (refundsByOrderId.get(orderId) || 0) + Math.max(0, number(refund.amount_kurus)) / 100);
      }

      const totals = new Map<string, { value: number; secondary: number }>();
      for (const order of paidOrders) {
        if (!order.created_at) continue;
        const key = keyForPeriod(period, order.created_at);
        const current = totals.get(key) || { value: 0, secondary: 0 };
        const gross = Math.max(0, number(order.total_amount));
        const refunded = Math.min(gross, Math.max(0, refundsByOrderId.get(String(order.id)) || 0));
        current.value += Math.max(0, gross - refunded);
        current.secondary += 1;
        totals.set(key, current);
      }

      const series = buckets.map((bucket) => {
        const total = totals.get(bucket.key) || { value: 0, secondary: 0 };
        return {
          key: bucket.key,
          label: bucket.label,
          value: Number(total.value.toFixed(2)),
          secondary: total.secondary,
        };
      });

      return NextResponse.json(
        {
          ok: true,
          metric,
          period,
          format: "currency",
          title: `${METRIC_LABELS[metric]} — ${PERIOD_LABELS[period]}`,
          series,
        },
        { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
      );
    }

    const eventNames = metric === "sessions" ? ["session_start"] : ["cart_created", "cart_add"];
    const result = await auth.supabase
      .from("analytics_events")
      .select("session_id,event_name,created_at")
      .in("event_name", eventNames)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: true });

    if (result.error) throw new Error(result.error.message);

    const sessionsByBucket = new Map<string, Set<string>>();
    for (const event of (result.data || []) as AnalyticsEvent[]) {
      if (!event.created_at || !event.session_id) continue;
      const key = keyForPeriod(period, event.created_at);
      const sessions = sessionsByBucket.get(key) || new Set<string>();
      sessions.add(event.session_id);
      sessionsByBucket.set(key, sessions);
    }

    const series = buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      value: sessionsByBucket.get(bucket.key)?.size || 0,
      secondary: 0,
    }));

    return NextResponse.json(
      {
        ok: true,
        metric,
        period,
        format: "number",
        title: `${METRIC_LABELS[metric]} — ${PERIOD_LABELS[period]}`,
        series,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Grafik verileri alınamadı." },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
    );
  }
}
