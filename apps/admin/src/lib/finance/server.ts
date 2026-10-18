import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  financeDate,
  financePeriod,
} from "@ruth-commerce/commerce-core/finance";

export const financeHeaders = { "Cache-Control": "private, no-store" };
export function financeJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: financeHeaders });
}
export function financeError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Finans işlemi tamamlanamadı.";
  const migration =
    /finance_.*does not exist|schema cache|relation.*finance_/.test(message);
  return financeJson(
    {
      ok: false,
      error: migration
        ? "Bu markanın self-host veritabanında finans SQL kurulumu henüz uygulanmamış."
        : message,
    },
    migration ? 503 : 400,
  );
}
export async function financeAuth(request: Request, permission = "view") {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth;
  // Finance never accepts an internal worker principal on the public admin API.
  if (auth.internal)
    return {
      error: financeJson(
        { ok: false, error: "Kullanıcı oturumu gerekli." },
        403,
      ),
    };
  const role = String(auth.user.app_metadata?.panel_role || auth.profile.role);
  if (!["owner", "admin"].includes(role)) {
    const { data, error } = await auth.supabase
      .from("finance_permissions")
      .select("permission")
      .eq("user_id", auth.user.id)
      .eq("permission", permission)
      .maybeSingle();
    if (error || !data)
      return {
        error: financeJson(
          { ok: false, error: "Bu finans işlemi için yetkin bulunmuyor." },
          403,
        ),
      };
  }
  return auth;
}
export function financeRange(url: URL) {
  const period = financePeriod(url.searchParams.get("range") || "month");
  const from = financeDate(url.searchParams.get("from") || period.from);
  const to = financeDate(url.searchParams.get("to") || period.to);
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 3660)
    throw new Error("Geçersiz tarih aralığı.");
  const currency = url.searchParams.get("currency") || "TRY";
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Para birimi geçersiz.");
  return { from, to, currency };
}
export async function financeRpc(
  db: Pick<
    ReturnType<typeof import("@/lib/supabaseAdmin").getSupabaseAdmin>,
    "rpc"
  >,
  name: string,
  parameters: Record<string, unknown> = {},
) {
  const { data, error } = await db.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data;
}
