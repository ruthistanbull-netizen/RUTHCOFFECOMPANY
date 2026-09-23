import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function rateHash(request: Request) {
  const salt = process.env.ACCOUNT_RATE_LIMIT_SALT || "rosta-checkout-identity-v1";
  return crypto.createHash("sha256").update(`${salt}|${clientIp(request)}`).digest("hex");
}

function genericResult(ok: boolean, matched = false, status = 200) {
  return NextResponse.json({ ok, matched }, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = clean(body.email).toLowerCase();
    const rawPhone = clean(body.phone);
    const phone = normalizePhone(rawPhone);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Checkout requires both contact fields. Requiring the pair here also
    // prevents this endpoint from becoming a single-identity lookup service.
    if (!validEmail || !isValidPhone(rawPhone) || !phone) return genericResult(true);

    const supabase = getSupabaseAdmin();
    const { data: rateAccepted, error: rateError } = await supabase.rpc("claim_public_action_rate", {
      p_action: "checkout_identity_match",
      p_identifier_hash: rateHash(request),
      p_limit: 40,
      p_window_seconds: 3600,
    });

    if (rateError) console.error("Checkout identity rate limit failed", rateError);
    if (rateAccepted === false) return genericResult(true);

    const [emailResult, phoneResult] = await Promise.all([
      supabase
        .from("customer_identities")
        .select("customer_id")
        .eq("identity_type", "email")
        .eq("normalized_value", email)
        .maybeSingle(),
      supabase
        .from("customer_identities")
        .select("customer_id")
        .eq("identity_type", "phone")
        .eq("normalized_value", phone)
        .maybeSingle(),
    ]);

    if (emailResult.error) throw new Error(emailResult.error.message);
    if (phoneResult.error) throw new Error(phoneResult.error.message);

    const ids = [...new Set([
      emailResult.data?.customer_id,
      phoneResult.data?.customer_id,
    ].filter((value): value is string => Boolean(value)))];

    if (!ids.length) return genericResult(true);

    const [customersResult, ordersResult] = await Promise.all([
      supabase
        .from("customers")
        .select("id")
        .in("id", ids)
        .eq("membership_status", "member")
        .limit(1),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("customer_id", ids),
    ]);

    if (customersResult.error) throw new Error(customersResult.error.message);
    if (ordersResult.error) throw new Error(ordersResult.error.message);

    const matched = Boolean(customersResult.data?.length) || Number(ordersResult.count || 0) > 0;
    return genericResult(true, matched);
  } catch (error) {
    console.error("Checkout identity match failed", error);
    return genericResult(false, false, 400);
  }
}
