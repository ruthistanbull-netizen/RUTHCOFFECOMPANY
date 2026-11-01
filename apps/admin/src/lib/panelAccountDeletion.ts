import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createIsolatedSupabaseAdmin } from "@/lib/supabaseAdmin";

const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number, code?: string) =>
  NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status, headers });

// The authenticated subject is the only deletion target. No body-supplied
// profile/user/email can select another account, including for owners/workers.
export async function deleteOwnPanelAccount(request: Request, auth: any) {
  if (auth.internal || !auth.user?.id || !auth.user?.email) return failure("Kendi hesabınla giriş yapmalısın.", 403);
  if (Number(request.headers.get("content-length") || 0) > 4096) return failure("İstek çok büyük.", 413);
  const body = await request.json().catch(() => null);
  if (!body || body.confirmation !== "HESABIMI SİL" || typeof body.password !== "string"
      || !body.password || body.password.length > 1024 || body.understands_business_retention !== true) {
    return failure("Şifreni ve kalıcı silme onayını gir.", 400);
  }
  try {
    const rate = await auth.supabase.rpc("claim_public_action_rate", {
      p_action: "panel-account-delete", p_identifier_hash: createHash("sha256").update(auth.user.id).digest("hex"),
      p_limit: 5, p_window_seconds: 900,
    });
    if (rate.error) return failure("Güvenlik doğrulaması şu anda yapılamıyor.", 503);
    if (rate.data !== true) return failure("Çok fazla deneme. 15 dakika sonra tekrar dene.", 429);

    // A separate, short-lived client prevents password reauthentication from
    // replacing the shared service-role client's session.
    const passwordClient = createIsolatedSupabaseAdmin();
    const verified = await passwordClient.auth.signInWithPassword({ email: auth.user.email, password: body.password });
    const temporaryJWT = verified.data.session?.access_token;
    try {
      if (verified.error || verified.data.user?.id !== auth.user.id || !temporaryJWT) {
        return failure("Şifre doğrulanamadı.", 401);
      }
      // PostgreSQL owns the transaction: profile/Auth/personal-data deletion
      // either commits together or rolls back. Business records are preserved.
      const deleted = await auth.supabase.rpc("delete_own_panel_account", {
        p_auth_user_id: auth.user.id, p_profile_id: auth.profile.id,
      });
      if (deleted.error) {
        const code = String(deleted.error.message || "");
        if (/ACCOUNT_RELATIONS_REVIEW_REQUIRED|ACCOUNT_STORAGE_REVIEW_REQUIRED/.test(code)) {
          return failure("Hesabına bağlı ek kayıtlar güvenle temizlenemedi. Hiçbir veri silinmedi. Destek: ruthistanbull@gmail.com", 409, "ACCOUNT_DELETION_BLOCKED");
        }
        return failure("Hesap silinemedi. İşlem tamamlanmadı; tekrar dene.", 503);
      }
      if (deleted.data?.deleted !== true) return failure("Silme işlemi doğrulanamadı.", 503);
      return NextResponse.json({ ok: true, deleted: true }, { headers });
    } finally {
      // On failure, discard only the temporary reauthentication session. On
      // success, the transaction has already removed all target Auth sessions.
      if (temporaryJWT) await auth.supabase.auth.admin.signOut(temporaryJWT, "local").catch(() => undefined);
    }
  } catch {
    return failure("Hesap servisine şu anda ulaşılamıyor. Tekrar dene.", 503);
  }
}
