import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  MetaMarketingError,
  requireMetaConnectionConfig,
  type MetaConnectionConfig,
} from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};
const REQUEST_TIMEOUT_MS = 18_000;
const TR_ESTIMATED_TAX_RATE = 0.2;

type AccountBalanceRaw = {
  id?: string;
  name?: string;
  currency?: string;
  balance?: string | number;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const config = requireMetaConnectionConfig();
    const account = await graphGet<AccountBalanceRaw>(config, `/${config.adAccountId}`, {
      fields: "id,name,currency,balance",
    });

    const balance = minorMoney(account.balance);
    const estimatedTax = roundMoney(balance * TR_ESTIMATED_TAX_RATE);
    const totalDebt = roundMoney(balance + estimatedTax);

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      account: {
        id: account.id || config.adAccountId,
        name: account.name || "Meta Reklam Hesabı",
        currency: account.currency || "TRY",
        balance,
      },
      billing: {
        estimatedTaxRate: TR_ESTIMATED_TAX_RATE,
        estimatedTax,
        totalDebt,
        estimated: true,
      },
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const normalized = error instanceof MetaMarketingError
      ? error
      : new MetaMarketingError({
        code: "META_ACCOUNT_BALANCE_FAILED",
        message: "Meta reklam hesabı bakiyesi alınamadı.",
        status: 502,
        retryable: true,
      });

    return NextResponse.json({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        providerCode: normalized.providerCode,
        providerSubcode: normalized.providerSubcode,
        traceId: normalized.traceId,
      },
    }, { status: normalized.status, headers: NO_STORE_HEADERS });
  }
}

async function graphGet<T>(
  config: MetaConnectionConfig,
  path: string,
  query: Record<string, string>,
): Promise<T> {
  const url = new URL(
    `${config.graphOrigin}/${config.graphVersion}${path.startsWith("/") ? path : `/${path}`}`,
  );
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) throw await providerError(response);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof MetaMarketingError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MetaMarketingError({
        code: "META_TIMEOUT",
        message: "Meta reklam bakiyesi isteği zaman aşımına uğradı.",
        status: 504,
        retryable: true,
      });
    }
    throw new MetaMarketingError({
      code: "META_NETWORK_ERROR",
      message: "Meta Marketing API bağlantısı kurulamadı.",
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function providerError(response: Response) {
  let payload: {
    error?: {
      message?: string;
      code?: number;
      error_subcode?: number;
      is_transient?: boolean;
      fbtrace_id?: string;
    };
  } = {};
  try {
    payload = await response.clone().json();
  } catch {
    // Provider response body is optional.
  }

  const provider = payload.error;
  return new MetaMarketingError({
    code: "META_PROVIDER_ERROR",
    message: provider?.message?.slice(0, 500) || `Meta isteği ${response.status} durumuyla başarısız oldu.`,
    status: response.status === 401 || response.status === 403 ? 502 : response.status >= 500 ? 502 : 400,
    retryable: provider?.is_transient === true || response.status === 429 || response.status >= 500,
    providerCode: typeof provider?.code === "number" ? provider.code : undefined,
    providerSubcode: typeof provider?.error_subcode === "number" ? provider.error_subcode : undefined,
    traceId: provider?.fbtrace_id,
  });
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function minorMoney(value: unknown) {
  return number(value) / 100;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
