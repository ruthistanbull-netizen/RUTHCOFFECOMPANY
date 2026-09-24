import {
  decryptGmailRefreshToken,
  ensureGmailAccessToken,
  getGmailProfile,
  makeMimeMessage,
  refreshGmailAccessToken,
  sendGmailMessage,
  type InlineEmailImage,
} from "@/lib/gmail";

type EmailIntegration = {
  id?: string;
  provider: "gmail" | string;
  profile_id?: string | null;
  email?: string | null;
  sender_name?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

type SendInput = {
  to: string;
  subject: string;
  html: string;
  inlineImages?: InlineEmailImage[];
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function gmailAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLocaleLowerCase("tr-TR");
  if (
    lower.includes("authenticate data") ||
    lower.includes("bad decrypt") ||
    lower.includes("refresh token şifre") ||
    lower.includes("refresh token çözülemedi")
  ) {
    return "Gmail bağlantısının güvenlik anahtarı veritabanı/hosting değişiminden sonra uyuşmuyor. Panelden Gmail hesabını bir kez yeniden bağla.";
  }
  if (
    lower.includes("invalid_grant") ||
    lower.includes("token has been expired") ||
    lower.includes("token has been revoked") ||
    lower.includes("invalid authentication credentials")
  ) {
    return "Gmail yetkisi sona ermiş veya Google tarafından iptal edilmiş. Panelden Gmail hesabını yeniden bağla.";
  }
  return message || "Gmail bağlantısı gönderime hazır değil.";
}

function isGmailAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLocaleLowerCase("en-US");
  return lower.includes("invalid authentication credentials")
    || lower.includes("invalid credentials")
    || lower.includes("unauthorized")
    || lower.includes("autherror")
    || lower.includes("login required")
    || lower.includes("invalid_grant")
    || lower.includes("token has been expired")
    || lower.includes("token has been revoked");
}

async function findActiveGmail(supabase: any, profileId?: string | null): Promise<EmailIntegration | null> {
  let query = supabase
    .from("email_integrations")
    .select("*")
    .eq("provider", "gmail")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (profileId) query = query.eq("profile_id", profileId);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (result.data && clean(result.data.email)) return result.data as EmailIntegration;

  // Profile-scoped panel actions never fall back to another admin's Gmail.
  // Global workers call without profileId and may use the latest explicitly
  // connected ROSTA Gmail integration.
  return null;
}

async function gmailAccessToken(supabase: any, integration: EmailIntegration) {
  if (integration.provider !== "gmail") {
    throw new Error("Desteklenmeyen mail sağlayıcısı. Gmail bağlantısını kullan.");
  }

  try {
    return await ensureGmailAccessToken(supabase, integration as any);
  } catch (error) {
    // Older Gmail rows may have a refresh token encrypted with the pre-migration
    // database key. If Google's current access token is still valid, keep mail
    // delivery working instead of failing before even trying that token.
    const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
    const cachedAccessToken = clean(integration.access_token);
    if (cachedAccessToken && expiresAt > Date.now() + 30_000) return cachedAccessToken;
    throw new Error(gmailAuthMessage(error));
  }
}

async function forceRefreshGmailAccessToken(supabase: any, integration: EmailIntegration) {
  const storedRefreshToken = clean(integration.refresh_token);
  if (!storedRefreshToken) throw new Error("Gmail refresh token yok. Gmail bağlantısını yeniden kur.");

  try {
    const refreshState = decryptGmailRefreshToken(storedRefreshToken);
    if (!refreshState.token) throw new Error("Gmail refresh token yok. Gmail bağlantısını yeniden kur.");
    const refreshed = await refreshGmailAccessToken(refreshState.token);
    const nextExpiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();

    if (integration.id) {
      const { error: updateError } = await supabase
        .from("email_integrations")
        .update({
          access_token: refreshed.access_token,
          expires_at: nextExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
      if (updateError) throw new Error(updateError.message);
    }

    integration.access_token = refreshed.access_token;
    integration.expires_at = nextExpiresAt;
    return refreshed.access_token;
  } catch (error) {
    throw new Error(gmailAuthMessage(error));
  }
}

export async function getActiveEmailIntegration(supabase: any, profileId?: string | null) {
  return findActiveGmail(supabase, profileId);
}

export async function verifyEmailIntegration(supabase: any, integration: EmailIntegration) {
  let accessToken = await gmailAccessToken(supabase, integration);
  try {
    const profile = await getGmailProfile(accessToken);
    return { provider: "gmail" as const, accessToken, profile };
  } catch (error) {
    if (!isGmailAuthenticationFailure(error)) throw error;
    accessToken = await forceRefreshGmailAccessToken(supabase, integration);
    try {
      const profile = await getGmailProfile(accessToken);
      return { provider: "gmail" as const, accessToken, profile };
    } catch (retryError) {
      throw new Error(gmailAuthMessage(retryError));
    }
  }
}

export async function sendEmailWithIntegration(supabase: any, integration: EmailIntegration, input: SendInput) {
  let accessToken = await gmailAccessToken(supabase, integration);
  const message = makeMimeMessage({
    fromEmail: clean(integration.email),
    fromName: clean(integration.sender_name) || "ROSTA Coffee Co.",
    to: input.to,
    subject: input.subject,
    html: input.html,
    inlineImages: input.inlineImages || [],
  });

  try {
    const sent = await sendGmailMessage(accessToken, message);
    return { provider: "gmail", id: sent.id, raw: sent };
  } catch (error) {
    if (!isGmailAuthenticationFailure(error)) throw error;

    // Google can revoke/expire an access token before the stored expires_at value.
    // Refresh once and retry the exact same Gmail API send attempt.
    accessToken = await forceRefreshGmailAccessToken(supabase, integration);
    const retried = await sendGmailMessage(accessToken, message);
    return { provider: "gmail", id: retried.id, raw: retried };
  }
}