import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function istanbulParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0),
  };
}

export async function enqueueDailyBackupPushIfDue() {
  const { date, hour } = istanbulParts();
  if (hour !== 0) return { ok: true, due: false, inserted: false };

  const supabase = getSupabaseAdmin();
  const dedupeKey = `daily-selfhost-supabase-backup:${date}`;
  const { error } = await supabase
    .from("admin_push_jobs")
    .upsert({
      kind: "health",
      dedupe_key: dedupeKey,
      payload: {
        service_key: `daily-selfhost-supabase-backup:${date}`,
        status: "degraded",
        title: "Supabase yedeğini indir",
        body: "ROSTA Coffee Co. self-host Supabase veritabanı yedeğini indir ve güvenli bir yerde sakla.",
        backup_date: date,
        timezone: "Europe/Istanbul",
      },
      target_url: "/system",
      status: "pending",
      available_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "dedupe_key",
      ignoreDuplicates: true,
    });

  if (error) return { ok: false, due: true, inserted: false, error: error.message };
  return { ok: true, due: true, inserted: true };
}
