import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getProfile(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Error("Oturum bulunamadı.");

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Error("Oturum geçersiz.");
  }

  const user = userData.user;

  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (existingProfile) return { supabase, user, profile: existingProfile };

  const { data: profile, error: createError } = await supabase
    .from("profiles")
    .upsert(
      {
        auth_user_id: user.id,
        email: user.email || null,
        full_name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
        phone: typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : null,
      },
      { onConflict: "auth_user_id" }
    )
    .select("id, email, full_name, phone")
    .single();

  if (createError) throw new Error(createError.message);
  if (!profile) throw new Error("Profil oluşturulamadı.");

  return { supabase, user, profile };
}

export async function GET(request: Request) {
  try {
    const { supabase, profile } = await getProfile(request);

    const { data: addresses, error } = await supabase
      .from("customer_addresses")
      .select("id, full_name, phone, email, city, district, neighborhood, address_line, postal_code, is_default, created_at")
      .eq("profile_id", profile.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, addresses: addresses || [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Adresler alınamadı." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, profile } = await getProfile(request);
    const body = await request.json().catch(() => ({}));

    const fullName = clean(body.fullName);
    const phone = clean(body.phone);
    const email = clean(body.email) || user.email || profile.email || "";
    const city = clean(body.city);
    const district = clean(body.district);
    const neighborhood = clean(body.neighborhood);
    const addressLine = clean(body.addressLine);
    const postalCode = clean(body.postalCode);

    if (!fullName) throw new Error("Ad soyad gerekli.");
    if (!phone) throw new Error("Telefon gerekli.");
    if (!city) throw new Error("Il gerekli.");
    if (!district) throw new Error("Ilçe gerekli.");
    if (!addressLine) throw new Error("Adres gerekli.");

    const { count } = await supabase
      .from("customer_addresses")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id);

    const shouldBeDefault = body.isDefault === true || Number(count || 0) === 0;

    if (shouldBeDefault) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("profile_id", profile.id);
    }

    const { data: address, error } = await supabase
      .from("customer_addresses")
      .insert({
        profile_id: profile.id,
        full_name: fullName,
        phone,
        email,
        city,
        district,
        neighborhood: neighborhood || null,
        address_line: addressLine,
        postal_code: postalCode || null,
        is_default: shouldBeDefault,
      })
      .select("id, full_name, phone, email, city, district, neighborhood, address_line, postal_code, is_default, created_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, address });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Adres eklenemedi." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, profile } = await getProfile(request);
    const body = await request.json().catch(() => ({}));
    const id = clean(body.id);

    if (!id) throw new Error("Adres seçilmedi.");

    if (body.isDefault === true) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("profile_id", profile.id);

      const { error } = await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", id)
        .eq("profile_id", profile.id);

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Adres güncellenemedi." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, profile } = await getProfile(request);
    const url = new URL(request.url);
    const id = clean(url.searchParams.get("id"));

    if (!id) throw new Error("Adres seçilmedi.");

    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", id)
      .eq("profile_id", profile.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Adres silinemedi." },
      { status: 400 }
    );
  }
}
