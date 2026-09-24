import { NextResponse } from "next/server";
import { normalizeCustomerPhone } from "@ruth-commerce/commerce-core/customer";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerSearchRow = {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  membership_source: "new_site" | "ikas" | null;
  terms_accepted: boolean;
  marketing_email_consent: boolean;
  marketing_email_consent_at: string | null;
  consent_source: string | null;
  service_email_allowed: boolean;
  city: string | null;
  district: string | null;
  created_at: string | null;
  last_order_at: string | null;
  last_order_no: string | null;
};

type AddressRow = {
  customer_id: string | null;
  city: string | null;
  district: string | null;
  address_line: string | null;
  is_default: boolean | null;
  created_at: string | null;
};

function safeSearchTerm(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, 100)
    .replace(/[,()%*_]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9@.+]+/g, " ")
    .trim();
}

function scoreCandidate(candidate: CustomerSearchRow, query: string) {
  const target = normalizeText(query);
  if (!target) return candidate.is_member ? 25 : 1;
  const values = [candidate.full_name, candidate.email, candidate.phone, candidate.last_order_no]
    .map(normalizeText)
    .filter(Boolean);
  let best = 0;
  for (const value of values) {
    if (value === target) best = Math.max(best, 1000);
    else if (value.startsWith(target)) best = Math.max(best, 750);
    else if (value.includes(target)) best = Math.max(best, 550);
    else {
      const terms = target.split(/\s+/).filter(Boolean);
      const matched = terms.filter((term) => value.includes(term)).length;
      if (matched) best = Math.max(best, matched * 120 - Math.abs(value.length - target.length));
    }
  }
  return best + (candidate.is_member ? 25 : 0);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const q = safeSearchTerm(url.searchParams.get("q"));

  let customerQuery = supabase
    .from("customer_read_model")
    .select("id, profile_id, full_name, email, phone, is_member, membership_source, terms_accepted, marketing_email_consent, marketing_email_consent_at, consent_source, service_email_allowed, city, district, created_at, last_order_at, last_order_no")
    .order("created_at", { ascending: false })
    .limit(q.length >= 2 ? 80 : 50);

  if (q.length >= 2) {
    const phone = normalizeCustomerPhone(q);
    const conditions = [
      `full_name.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      `last_order_no.ilike.%${q}%`,
    ];
    if (phone) conditions.push(`phone.ilike.%${phone}%`);
    customerQuery = customerQuery.or(conditions.join(","));
  }

  const { data, error } = await customerQuery;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const customerRows = (data || []) as CustomerSearchRow[];
  const customerIds = customerRows.map((customer) => customer.id);
  const addressMap = new Map<string, AddressRow>();
  if (customerIds.length) {
    const { data: addresses } = await supabase
      .from("customer_addresses")
      .select("customer_id, city, district, address_line, is_default, created_at")
      .in("customer_id", customerIds)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    for (const address of (addresses || []) as AddressRow[]) {
      const key = String(address.customer_id || "");
      if (key && !addressMap.has(key)) addressMap.set(key, address);
    }
  }

  const customers = customerRows
    .map((customer) => ({
      customer: {
        ...customer,
        auth_user_id: null,
        is_legacy_member: customer.membership_source === "ikas",
        address: addressMap.get(customer.id) || {
          customer_id: customer.id,
          city: customer.city,
          district: customer.district,
          address_line: null,
          is_default: null,
          created_at: null,
        },
      },
      score: scoreCandidate(customer, q),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (!q) {
        return new Date(right.customer.created_at || 0).getTime() - new Date(left.customer.created_at || 0).getTime();
      }
      return right.score - left.score || Number(right.customer.is_member) - Number(left.customer.is_member);
    })
    .slice(0, q ? 16 : 50)
    .map((entry) => entry.customer);

  return NextResponse.json({ ok: true, customers });
}

export async function PATCH(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.profile_id||body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Müşteri profil id eksik."},{status:400});
  const allowed=["full_name","phone","birth_date","marketing_email_consent"];
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of allowed) if(key in body) update[key]=body[key] === "" ? null : body[key];
  const {data,error}=await auth.supabase.from("profiles").update(update).eq("id",id).select("id,email,full_name,phone,marketing_email_consent").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  return NextResponse.json({ok:true,profile:data});
}
