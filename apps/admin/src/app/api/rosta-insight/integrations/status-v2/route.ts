import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  inspectMetaMarketingConnection,
  MetaMarketingError,
} from "@/lib/integrations/metaMarketing";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IntegrationId =
  | "search-console"
  | "google-analytics"
  | "google-tag-manager"
  | "clarity"
  | "meta"
  | "tiktok"
  | "supabase"
  | "paytr"
  | "basit-kargo"
  | "gmail"
  | "openai"
  | "zeabur"
  | "github";

type IntegrationState = { connected: boolean; detail: string };
type Definition = {
  id: IntegrationId;
  overrideFlag: string;
  requirementGroups: string[][];
  connectedDetail: string;
  disconnectedDetail: string;
};

const definitions: Definition[] = [
  {
    id: "search-console",
    overrideFlag: "ROSTA_INSIGHT_SEARCH_CONSOLE_CONNECTED",
    requirementGroups: [
      ["GOOGLE_SEARCH_CONSOLE_CLIENT_ID", "GOOGLE_CLIENT_ID"],
      ["GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN", "GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_APPLICATION_CREDENTIALS"],
    ],
    connectedDetail: "Search Console erişim bilgileri tanımlı.",
    disconnectedDetail: "Search Console OAuth veya servis hesabı bilgileri eksik.",
  },
  {
    id: "google-analytics",
    overrideFlag: "ROSTA_INSIGHT_GOOGLE_ANALYTICS_CONNECTED",
    requirementGroups: [["GA4_MEASUREMENT_ID", "NEXT_PUBLIC_GA_MEASUREMENT_ID"]],
    connectedDetail: "GA4 ölçüm kimliği tanımlı.",
    disconnectedDetail: "GA4 ölçüm kimliği eksik.",
  },
  {
    id: "google-tag-manager",
    overrideFlag: "ROSTA_INSIGHT_GTM_CONNECTED",
    requirementGroups: [["GTM_CONTAINER_ID", "NEXT_PUBLIC_GTM_ID", "NEXT_PUBLIC_GTM_CONTAINER_ID"]],
    connectedDetail: "Google Tag Manager konteyneri tanımlı.",
    disconnectedDetail: "Google Tag Manager konteyner kimliği eksik.",
  },
  {
    id: "clarity",
    overrideFlag: "ROSTA_INSIGHT_CLARITY_CONNECTED",
    requirementGroups: [["NEXT_PUBLIC_CLARITY_PROJECT_ID", "CLARITY_PROJECT_ID"]],
    connectedDetail: "Microsoft Clarity proje kimliği tanımlı.",
    disconnectedDetail: "Microsoft Clarity proje kimliği eksik.",
  },
  {
    id: "meta",
    overrideFlag: "ROSTA_INSIGHT_META_CONNECTED",
    requirementGroups: [
      ["META_SYSTEM_USER_ACCESS_TOKEN", "META_ACCESS_TOKEN", "FACEBOOK_ACCESS_TOKEN", "META_CAPI_ACCESS_TOKEN"],
      ["META_AD_ACCOUNT_ID", "FACEBOOK_AD_ACCOUNT_ID"],
    ],
    connectedDetail: "Meta System User erişimi ve reklam hesabı tanımlı.",
    disconnectedDetail: "Meta System User tokenı veya reklam hesabı kimliği eksik.",
  },
  {
    id: "tiktok",
    overrideFlag: "ROSTA_INSIGHT_TIKTOK_CONNECTED",
    requirementGroups: [
      ["TIKTOK_ACCESS_TOKEN", "TIKTOK_ADS_ACCESS_TOKEN"],
      ["TIKTOK_ADVERTISER_ID", "TIKTOK_AD_ACCOUNT_ID"],
    ],
    connectedDetail: "TikTok Ads erişimi ve reklam hesabı tanımlı.",
    disconnectedDetail: "TikTok Ads erişim anahtarı veya reklam hesabı kimliği eksik.",
  },
  {
    id: "supabase",
    overrideFlag: "ROSTA_INSIGHT_SUPABASE_CONNECTED",
    requirementGroups: [
      ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
      ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    connectedDetail: "Supabase proje adresi ve erişim anahtarı tanımlı.",
    disconnectedDetail: "Supabase proje adresi veya erişim anahtarı eksik.",
  },
  {
    id: "paytr",
    overrideFlag: "ROSTA_INSIGHT_PAYTR_CONNECTED",
    requirementGroups: [["PAYTR_MERCHANT_ID"], ["PAYTR_MERCHANT_KEY"], ["PAYTR_MERCHANT_SALT"]],
    connectedDetail: "PayTR mağaza bilgileri tanımlı.",
    disconnectedDetail: "PayTR merchant ID, key veya salt eksik.",
  },
  {
    id: "basit-kargo",
    overrideFlag: "ROSTA_INSIGHT_BASIT_KARGO_CONNECTED",
    requirementGroups: [["BASIT_KARGO_API_TOKEN"]],
    connectedDetail: "Basit Kargo API erişimi tanımlı.",
    disconnectedDetail: "Basit Kargo API tokenı henüz tanımlı değil.",
  },
  {
    id: "gmail",
    overrideFlag: "ROSTA_INSIGHT_GMAIL_CONNECTED",
    requirementGroups: [["GOOGLE_CLIENT_ID"], ["GOOGLE_CLIENT_SECRET"], ["GMAIL_REDIRECT_URI"]],
    connectedDetail: "Gmail OAuth yapılandırması tanımlı.",
    disconnectedDetail: "Gmail OAuth yapılandırması veya aktif hesap bağlantısı eksik.",
  },
  {
    id: "openai",
    overrideFlag: "ROSTA_INSIGHT_OPENAI_CONNECTED",
    requirementGroups: [["OPENAI_API_KEY"]],
    connectedDetail: "OpenAI API anahtarı tanımlı.",
    disconnectedDetail: "OpenAI API anahtarı eksik.",
  },
  {
    id: "zeabur",
    overrideFlag: "ROSTA_INSIGHT_ZEABUR_CONNECTED",
    requirementGroups: [["ZEABUR_SERVICE_ID"], ["ZEABUR_PROJECT_ID"], ["ZEABUR_WEB_URL"]],
    connectedDetail: "Zeabur servis, proje ve web URL bilgileri çalışma ortamında doğrulandı.",
    disconnectedDetail: "Zeabur çalışma ortamı bilgileri bu servis içinde doğrulanamadı.",
  },
  {
    id: "github",
    overrideFlag: "ROSTA_INSIGHT_GITHUB_CONNECTED",
    requirementGroups: [["GITHUB_TOKEN", "GH_TOKEN", "GITHUB_APP_TOKEN"], ["GITHUB_REPOSITORY", "ROSTA_GITHUB_REPOSITORY"]],
    connectedDetail: "GitHub erişimi ve repo bilgisi tanımlı.",
    disconnectedDetail: "GitHub erişim anahtarı veya repo bilgisi eksik.",
  },
];

function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function flagValue(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  if (["1", "true", "yes", "connected"].includes(value || "")) return true;
  if (["0", "false", "no", "disconnected"].includes(value || "")) return false;
  return null;
}

function environmentState(definition: Definition): IntegrationState {
  const override = flagValue(definition.overrideFlag);
  const connected = override ?? definition.requirementGroups.every((group) => group.some(hasValue));
  return {
    connected,
    detail: connected ? definition.connectedDetail : definition.disconnectedDetail,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const integrations = Object.fromEntries(
    definitions.map((definition) => [definition.id, environmentState(definition)]),
  ) as Record<IntegrationId, IntegrationState>;

  // OAuth istemci ayarları altyapıyı hazırlar; gerçek Gmail bağlantısı ayrı tutulur.
  const gmailOauthReady = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_REDIRECT_URI"].every(hasValue);
  integrations.gmail = {
    connected: false,
    detail: gmailOauthReady
      ? "Gmail OAuth altyapısı hazır; panelden bir Gmail hesabı bağlanmayı bekliyor."
      : "Gmail OAuth yapılandırması eksik; bağlantı henüz kurulmadı.",
  };

  const live: Record<string, unknown> = {};
  const searchParams = new URL(request.url).searchParams;
  const requestedProvider = searchParams.get("provider")?.trim().toLowerCase();
  const liveSelector = searchParams.get("live")?.trim().toLowerCase();
  const wantsMetaLive = requestedProvider === "meta" || liveSelector === "meta";

  try {
    const { data } = await auth.supabase
      .from("email_integrations")
      .select("provider, status, email, updated_at")
      .eq("profile_id", auth.profile.id)
      .eq("provider", "gmail")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      integrations.gmail = {
        connected: true,
        detail: `Gmail hesabı aktif olarak bağlı${data.email ? `: ${data.email}` : "."}`,
      };
    }
  } catch {
    // Environment-based status remains available if the optional table query fails.
  }

  if (wantsMetaLive) {
    try {
      const report = await inspectMetaMarketingConnection();
      live.meta = report;
      integrations.meta = {
        connected: report.ok,
        detail: report.readiness.management
          ? "Meta reklam hesabı canlı olarak doğrulandı; raporlama ve yönetim yetkileri hazır."
          : report.readiness.reporting
            ? "Meta reklam hesabı canlı olarak doğrulandı; raporlama hazır, yönetim yetkisi doğrulanmadı."
            : "Meta ENV değerleri var ancak canlı reklam hesabı bağlantısı doğrulanamadı.",
      };
    } catch (error) {
      const normalized = error instanceof MetaMarketingError
        ? error
        : new MetaMarketingError({
          code: "META_CONNECTION_CHECK_FAILED",
          message: "Meta canlı bağlantı testi tamamlanamadı.",
          status: 500,
        });
      integrations.meta = { connected: false, detail: normalized.message };
      live.meta = {
        ok: false,
        error: {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
          providerCode: normalized.providerCode,
          providerSubcode: normalized.providerSubcode,
          traceId: normalized.traceId,
        },
      };
    }
  }

  return NextResponse.json({ ok: true, integrations, live }, { headers: noStoreHeaders() });
}
