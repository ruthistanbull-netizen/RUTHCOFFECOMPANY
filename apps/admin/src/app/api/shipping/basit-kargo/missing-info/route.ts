import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value || "").trim();
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const orderId = clean(body.orderId);
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Sipariş bulunamadı." }, { status: 400, headers: noStoreHeaders() });
    }

    const name = clean(body.name);
    const phone = clean(body.phone);
    const city = clean(body.city);
    const town = clean(body.town);
    const neighborhood = clean(body.neighborhood);
    const address = clean(body.address);
    const hasInfo = Boolean(name || phone || city || town || neighborhood || address);
    if (!hasInfo) {
      return NextResponse.json({ ok: false, error: "Kaydedilecek bilgi girilmedi." }, { status: 400, headers: noStoreHeaders() });
    }

    const now = new Date().toISOString();
    const addressText = [
      neighborhood,
      address,
      [town, city].filter(Boolean).join("/"),
    ].filter(Boolean).join(", ");

    const patch = {
      ...(name ? { customer_name: name } : {}),
      ...(phone ? { customer_phone: phone } : {}),
      ...(city ? { shipping_city: city } : {}),
      ...(town ? { shipping_town: town } : {}),
      ...(neighborhood ? { shipping_neighborhood: neighborhood } : {}),
      ...(address ? { shipping_address_line: address } : {}),
      ...(addressText ? { shipping_address_text: addressText } : {}),
      shipping_error: null,
      shipping_updated_at: now,
      updated_at: now,
    };

    const { data, error } = await auth.supabase
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select("id, customer_name, customer_phone, shipping_city, shipping_town, shipping_neighborhood, shipping_address_line, shipping_address_text")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message || "Sipariş bilgileri kaydedilemedi." }, { status: 400, headers: noStoreHeaders() });
    }

    const revalidate = await revalidateWebsite({ source: "basit-kargo-missing-info-saved" });
    return NextResponse.json({ ok: true, order: data, revalidate }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sipariş bilgileri kaydedilemedi." }, { status: 400, headers: noStoreHeaders() });
  }
}
