import { NextResponse } from "next/server";
import { normalizeCustomerPhone } from "@ruth-commerce/commerce-core/customer";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerReadModel = {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  membership_source: "new_site" | "ikas" | null;
  ikas_account_status: string | null;
  reward_points_balance: number | null;
  birthday_reward_points: number | null;
  terms_accepted: boolean | null;
  marketing_email_consent: boolean | null;
  marketing_email_status: "granted" | "denied" | "unknown";
  marketing_email_consent_at: string | null;
  consent_source: string | null;
  service_email_allowed: boolean;
  source: string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  order_count: number | null;
  paid_order_count: number | null;
  total_spent: number | string | null;
  last_order_id: string | null;
  last_order_no: string | null;
  last_order_at: string | null;
  last_payment_status: string | null;
  city: string | null;
  district: string | null;
};

function safeSearchTerm(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, 100)
    .replace(/[,()%*_]/g, " ")
    .replace(/\s+/g, " ");
}

function numeric(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function mapCustomer(row: CustomerReadModel) {
  return {
    ...row,
    reward_points_balance: Math.max(0, Math.floor(numeric(row.reward_points_balance))),
    birthday_reward_points: Math.max(0, Math.floor(numeric(row.birthday_reward_points))),
    terms_accepted: Boolean(row.terms_accepted),
    marketing_email_consent: Boolean(row.marketing_email_consent),
    service_email_allowed: Boolean(row.service_email_allowed),
    order_count: Math.max(0, Math.floor(numeric(row.order_count))),
    paid_order_count: Math.max(0, Math.floor(numeric(row.paid_order_count))),
    total_spent: Math.max(0, numeric(row.total_spent)),
  };
}

function unavailable(message: string, code: string) {
  return NextResponse.json(
    { ok: false, error: message, code },
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": "1",
        "X-Ruth-Customer-Source": "read-model-unavailable",
      },
    },
  );
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const search = safeSearchTerm(url.searchParams.get("q"));
  const membership = url.searchParams.get("membership") || "all";
  const sort = url.searchParams.get("sort") || "recent";
  const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page") || 1)));
  const pageSize = Math.max(10, Math.min(500, Math.trunc(Number(url.searchParams.get("pageSize") || 25))));
  const from = (page - 1) * pageSize;

  let query = auth.supabase
    .from("customer_read_model")
    .select("id, profile_id, full_name, email, phone, is_member, membership_source, ikas_account_status, reward_points_balance, birthday_reward_points, terms_accepted, marketing_email_consent, marketing_email_status, marketing_email_consent_at, consent_source, service_email_allowed, source, first_seen_at, last_seen_at, created_at, order_count, paid_order_count, total_spent, last_order_id, last_order_no, last_order_at, last_payment_status, city, district", { count: "exact" });

  if (membership === "member") query = query.eq("is_member", true);
  if (membership === "non_member") query = query.eq("is_member", false);

  if (search) {
    const phone = normalizeCustomerPhone(search);
    const conditions = [
      `full_name.ilike.%${search}%`,
      `email.ilike.%${search}%`,
      `city.ilike.%${search}%`,
      `district.ilike.%${search}%`,
      `last_order_no.ilike.%${search}%`,
    ];
    if (phone) conditions.push(`phone.ilike.%${phone}%`);
    query = query.or(conditions.join(","));
  }

  if (sort === "spent") {
    query = query.order("total_spent", { ascending: false }).order("last_order_at", { ascending: false, nullsFirst: false });
  } else if (sort === "orders") {
    query = query.order("paid_order_count", { ascending: false }).order("last_order_at", { ascending: false, nullsFirst: false });
  } else if (sort === "name") {
    query = query.order("full_name", { ascending: true, nullsFirst: false }).order("email", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false }).order("last_order_at", { ascending: false, nullsFirst: false });
  }

  const [customerResult, summaryResult] = await Promise.all([
    query.range(from, from + pageSize - 1),
    auth.supabase.from("customer_summary_read_model").select("*").maybeSingle(),
  ]);

  if (customerResult.error) {
    return unavailable(`Müşteri listesi alınamadı: ${customerResult.error.message}`, "CUSTOMER_READ_MODEL_ERROR");
  }
  if (summaryResult.error) {
    return unavailable(`Müşteri özeti alınamadı: ${summaryResult.error.message}`, "CUSTOMER_SUMMARY_READ_MODEL_ERROR");
  }

  const total = Math.max(0, Number(customerResult.count || 0));
  const summaryRow = summaryResult.data || {};
  const summaryCustomerCount = Math.max(0, Math.floor(numeric(summaryRow.customer_count)));

  if (!search && membership === "all") {
    if (total === 0 && summaryCustomerCount > 0) {
      return unavailable("Müşteri listesi ile özet geçici olarak uyuşmuyor. Tekrar deneyin.", "CUSTOMER_READ_MODEL_OUT_OF_SYNC");
    }
    if (total > 0 && summaryCustomerCount === 0) {
      return unavailable("Müşteri özeti henüz güncel değil. Tekrar deneyin.", "CUSTOMER_SUMMARY_OUT_OF_SYNC");
    }
  }

  const customers = ((customerResult.data || []) as CustomerReadModel[]).map(mapCustomer);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    ok: true,
    source: "read_model",
    customers,
    summary: {
      customerCount: summaryCustomerCount,
      memberCount: Math.max(0, Math.floor(numeric(summaryRow.member_count))),
      nonMemberCount: Math.max(0, Math.floor(numeric(summaryRow.non_member_count))),
      customersWithOrders: Math.max(0, Math.floor(numeric(summaryRow.customers_with_orders))),
      totalPaidRevenue: Math.max(0, numeric(summaryRow.total_paid_revenue)),
    },
    pagination: {
      page: Math.min(page, totalPages),
      pageSize,
      total,
      totalPages,
    },
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Ruth-Customer-Source": "read-model",
    },
  });
}
