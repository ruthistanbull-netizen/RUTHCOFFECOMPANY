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

async function findActiveGmail(supabase: any, profileId?: string | null): Promise<EmailIntegration | null> {
  let query = supabase
    .from("email_integrations")
    .select("*")
    .eq("provider", "gmail")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (profileId) query = query.eq("profile_id", profileId);
  const own = await query.maybeSingle();
  if (own.error) throw new Error(own.error.message);
  if (own.data && clean(own.data.email)) return own.data as EmailIntegration;

  if (profileId) {
    const shared = await supabase
      .from("email_integrations")
      .select("*")
      .eq("provider", "gmail")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shared.error) throw new Error(shared.error.message);
    if (shared.data && clean(shared.data.email)) return shared.data as EmailIntegration;
  }
  return null;
}

async function forceRefresh(supabase: any, integration: EmailIntegration) {
  const stored = clean(integration.refresh_token);
  if (!stored) throw new Error("Gmail refresh token yok. Gmail hesabını yeniden bağla.");
  const refresh = decryptGmailRefreshToken(stored);
  if (!refresh.token) throw new Error("Gmail refresh token çözülemedi.");

  const next = await refreshGmailAccessToken(refresh.token);
  const expiresAt = new Date(Date.now() + Number(next.expires_in || 3600) * 1000).toISOString();

  if (integration.id) {
    const update = await supabase.from("email_integrations").update({
      access_token: next.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq("id", integration.id);
    if (update.error) throw new Error(update.error.message);
  }
  integration.access_token = next.access_token;
  integration.expires_at = expiresAt;
  return next.access_token;
}

export async function getActiveEmailIntegration(supabase: any, profileId?: string | null) {
  return findActiveGmail(supabase, profileId);
}

export async function verifyEmailIntegration(supabase: any, integration: EmailIntegration) {
  let token = await ensureGmailAccessToken(supabase, integration as any);
  try {
    const profile = await getGmailProfile(token);
    return { provider: "gmail" as const, accessToken: token, profile };
  } catch {
    token = await forceRefresh(supabase, integration);
    const profile = await getGmailProfile(token);
    return { provider: "gmail" as const, accessToken: token, profile };
  }
}

export async function sendEmailWithIntegration(supabase: any, integration: EmailIntegration, input: SendInput) {
  let token = await ensureGmailAccessToken(supabase, integration as any);
  const build = () => makeMimeMessage({
    fromEmail: clean(integration.email),
    fromName: clean(integration.sender_name) || "ROSTA Coffee Co.",
    to: input.to,
    subject: input.subject,
    html: input.html,
    inlineImages: input.inlineImages || [],
  });

  try {
    const sent = await sendGmailMessage(token, build());
    return { provider: "gmail", id: sent.id, raw: sent };
  } catch {
    token = await forceRefresh(supabase, integration);
    const sent = await sendGmailMessage(token, build());
    return { provider: "gmail", id: sent.id, raw: sent };
  }
}
