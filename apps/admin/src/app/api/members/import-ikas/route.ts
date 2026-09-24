import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalizeEmail = (value: unknown) => clean(value).toLocaleLowerCase("tr-TR");
const normalizePhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("5")) return `90${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("90")) return digits;
  return digits;
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((item) => item.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).filter((cells) => cells.some((cell) => clean(cell))).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => { record[header] = cells[index] ?? ""; });
    return record;
  });
}

async function loadAllAuthUsers(supabase: any) {
  const users: any[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }
  return users;
}

async function loadAllProfiles(supabase: any) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 1_000_000; from += pageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, auth_user_id, full_name, email, phone, phone_normalized, reward_points_balance, created_at")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function parseDate(value: string) {
  const match = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) return null;
  const [, day, month, year, hour = "00", minute = "00"] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fullName(row: Record<string, string>) {
  return `${clean(row["İsim"])} ${clean(row["Soyisim"])}`.replace(/\s+/g, " ").trim();
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "ikas-musteriler.csv dosyasını seçmelisin." }, { status: 400 });
    }

    const rows = parseCsv(await file.text());
    const activeRows = rows.filter((row) => clean(row["Hesap Durumu"]).toUpperCase() === "ACTIVE_ACCOUNT");
    if (!activeRows.length) {
      return NextResponse.json({ ok: false, error: "Dosyada ACTIVE_ACCOUNT müşteri bulunamadı." }, { status: 400 });
    }

    const uniqueByEmail = new Map<string, Record<string, string>>();
    for (const row of activeRows) {
      const email = normalizeEmail(row["E-posta"]);
      if (email && email.includes("@") && !uniqueByEmail.has(email)) uniqueByEmail.set(email, row);
    }
    const members = [...uniqueByEmail.entries()].map(([email, row]) => ({ email, row }));

    const [authUsers, profiles] = await Promise.all([
      loadAllAuthUsers(auth.supabase),
      loadAllProfiles(auth.supabase),
    ]);

    const authByEmail = new Map(authUsers.map((user) => [normalizeEmail(user.email), user]));
    const profileByEmail = new Map<string, any>();
    const profileByPhone = new Map<string, any>();
    for (const profile of profiles) {
      const email = normalizeEmail(profile.email);
      const phone = normalizePhone(profile.phone_normalized || profile.phone);
      const previous = email ? profileByEmail.get(email) : null;
      if (email && (!previous || (!previous.auth_user_id && profile.auth_user_id))) profileByEmail.set(email, profile);
      if (phone && !profileByPhone.has(phone)) profileByPhone.set(phone, profile);
    }

    const summary = {
      sourceActive: activeRows.length,
      uniqueEmails: members.length,
      authCreated: 0,
      authExisting: 0,
      profileLinked: 0,
      profileCreated: 0,
      skipped: 0,
      failed: 0,
    };
    const errors: string[] = [];

    for (const { email, row } of members) {
      try {
        const name = fullName(row);
        const phone = clean(row["Telefon Numarası"]);
        const phoneNormalized = normalizePhone(phone);
        const ikasCustomerId = clean(row["Müşteri ID"]);
        const createdAt = parseDate(row["Oluşturulma Zamanı"]);

        let authUser = authByEmail.get(email) || null;
        if (!authUser) {
          const { data, error } = await (auth.supabase.auth.admin as any).createUser({
            email,
            email_confirm: true,
            user_metadata: {
              full_name: name || undefined,
              phone: phone || undefined,
              phone_normalized: phoneNormalized || undefined,
              imported_from: "ikas",
              migrated_member: true,
              ikas_customer_id: ikasCustomerId || undefined,
            },
          });
          if (error || !data.user) throw new Error(error?.message || "Auth hesabı oluşturulamadı.");
          authUser = data.user;
          authByEmail.set(email, authUser);
          summary.authCreated += 1;
        } else summary.authExisting += 1;

        let profile = profileByEmail.get(email) || (phoneNormalized ? profileByPhone.get(phoneNormalized) : null) || null;
        const migrationPointsGranted = Boolean(authUser.user_metadata?.legacy_welcome_points_granted);

        const profilePayload = {
          auth_user_id: authUser.id,
          email,
          full_name: name || profile?.full_name || null,
          phone: phone || profile?.phone || null,
          phone_normalized: phoneNormalized || profile?.phone_normalized || null,
          is_legacy_member: true,
          ikas_customer_id: ikasCustomerId || null,
          ikas_account_status: "ACTIVE_ACCOUNT",
          ikas_account_created_at: createdAt,
          membership_matched_at: new Date().toISOString(),
        };

        if (profile) {
          const { error } = await auth.supabase.from("profiles").update(profilePayload).eq("id", profile.id);
          if (error) throw new Error(error.message);
          profile = { ...profile, ...profilePayload };
          summary.profileLinked += 1;
        } else {
          const { data, error } = await auth.supabase
            .from("profiles")
            .insert({ ...profilePayload, reward_points_balance: 0 })
            .select("id, auth_user_id, full_name, email, phone, phone_normalized")
            .single();
          if (error || !data) throw new Error(error?.message || "Müşteri profili oluşturulamadı.");
          profile = data;
          summary.profileCreated += 1;
        }

        if (!migrationPointsGranted) {
          const currentBalance = Math.max(0, Math.floor(Number(profile.reward_points_balance || 0)));
          const pointsToGrant = Math.max(0, 2000 - currentBalance);
          if (pointsToGrant > 0) {
            const { error: pointsError } = await auth.supabase.rpc("adjust_rosta_points", {
              p_profile_id: profile.id,
              p_amount: pointsToGrant,
              p_reason: "İkas üye aktarımı hoş geldin puanı",
              p_transaction_type: "welcome",
              p_reference_type: "ikas_member_migration",
              p_reference_id: ikasCustomerId || email,
              p_admin_profile_id: auth.profile?.id || null,
            });
            if (pointsError) {
              const { error: fallbackError } = await auth.supabase
                .from("profiles")
                .update({ reward_points_balance: 2000 })
                .eq("id", profile.id);
              if (fallbackError) throw new Error(pointsError.message || fallbackError.message);
            }
            profile = { ...profile, reward_points_balance: 2000 };
          }

          const { error: metadataError } = await (auth.supabase.auth.admin as any).updateUserById(authUser.id, {
            user_metadata: {
              ...(authUser.user_metadata || {}),
              legacy_welcome_points_granted: true,
              legacy_welcome_points_amount: 2000,
            },
          });
          if (metadataError) throw new Error(metadataError.message);
          authUser = {
            ...authUser,
            user_metadata: {
              ...(authUser.user_metadata || {}),
              legacy_welcome_points_granted: true,
              legacy_welcome_points_amount: 2000,
            },
          };
          authByEmail.set(email, authUser);
        }

        profileByEmail.set(email, profile);
        if (phoneNormalized) profileByPhone.set(phoneNormalized, profile);
      } catch (error) {
        summary.failed += 1;
        errors.push(`${email}: ${error instanceof Error ? error.message : "Aktarım başarısız."}`);
      }
    }

    return NextResponse.json({
      ok: summary.failed === 0,
      summary,
      errors: errors.slice(0, 30),
      message: summary.failed
        ? `${summary.authCreated} yeni hesap oluşturuldu; ${summary.failed} kayıt aktarılamadı.`
        : `${summary.authCreated} yeni hesap oluşturuldu. Hiçbir e-posta gönderilmedi.`,
    }, { status: summary.failed ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Üye aktarımı tamamlanamadı." }, { status: 400 });
  }
}
