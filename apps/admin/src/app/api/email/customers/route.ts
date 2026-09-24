import { NextResponse } from "next/server";
import { normalizeCustomerEmail } from "@ruth-commerce/commerce-core/customer";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

type CustomerEmailRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_member: boolean | null;
  membership_source: "new_site" | "ikas" | null;
  terms_accepted: boolean | null;
  marketing_email_consent: boolean | null;
  marketing_email_status: "granted" | "denied" | "unknown" | null;
  marketing_email_consent_at: string | null;
  consent_source: string | null;
  service_email_allowed: boolean | null;
  order_count: number | null;
  total_spent: number | string | null;
  last_order_no: string | null;
  last_order_at: string | null;
  last_payment_status: string | null;
};

function searchValue(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function numberValue(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function mapCustomer(row: CustomerEmailRow) {
  const email = normalizeCustomerEmail(row.email) || "";
  return {
    id: row.id,
    email,
    name: String(row.full_name || "").trim(),
    phone: String(row.phone || "").trim(),
    group: numberValue(row.order_count) > 0 ? "purchased" as const : "not_purchased" as const,
    order_count: Math.max(0, Math.floor(numberValue(row.order_count))),
    total_spent: Math.max(0, numberValue(row.total_spent)),
    last_order_no: String(row.last_order_no || ""),
    last_order_at: row.last_order_at || null,
    payment_status: row.last_payment_status || null,
    terms_accepted: Boolean(row.terms_accepted),
    marketing_email_consent: Boolean(row.marketing_email_consent),
    marketing_email_status: row.marketing_email_status || "unknown",
    marketing_email_consent_at: row.marketing_email_consent_at || null,
    consent_source: row.consent_source || null,
    service_email_allowed: Boolean(row.service_email_allowed),
    is_member: Boolean(row.is_member),
    membership_source: row.membership_source || null,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const q = searchValue(url.searchParams.get("q"));

  const { data, error } = await supabase
    .from("customer_read_model")
    .select("id, full_name, email, phone, is_member, membership_source, terms_accepted, marketing_email_consent, marketing_email_status, marketing_email_consent_at, consent_source, service_email_allowed, order_count, total_spent, last_order_no, last_order_at, last_payment_status")
    .not("email", "is", null)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const allCustomers = ((data || []) as CustomerEmailRow[])
    .map(mapCustomer)
    .filter((customer) => Boolean(customer.email));

  const purchased = allCustomers.filter((customer) => customer.group === "purchased");
  const notPurchased = allCustomers.filter((customer) => customer.group === "not_purchased");

  const filter = (items: typeof allCustomers) => {
    if (!q) return items;
    return items.filter((item) =>
      [item.email, item.name, item.phone, item.last_order_no]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q)
    );
  };

  return NextResponse.json({
    ok: true,
    customers: {
      purchased: filter(purchased),
      not_purchased: filter(notPurchased),
      all: filter(allCustomers),
    },
    counts: {
      purchased: purchased.length,
      not_purchased: notPurchased.length,
      all: allCustomers.length,
    },
  });
}
