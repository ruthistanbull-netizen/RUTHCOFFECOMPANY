import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_KEY = String(process.env.PHASE0_STOREFRONT_DB_RUNTIME_PROBE_KEY || "").trim();

const KEY_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const DB_ENV_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "SUPABASE_DB_URL",
  "POSTGRES_PRISMA_URL",
] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function baseSupabaseUrl() {
  return normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
}

async function probe(baseUrl: string, keySource: string, apiKey: string) {
  if (!apiKey) return { keySource, present: false, accepted: false, status: null };

  try {
    const response = await fetch(`${baseUrl}/pg/query?statementTimeoutSecs=5&queryTimeoutSecs=8`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        "x-pg-application-name": "rosta-phase0-storefront-runtime-probe",
      },
      body: JSON.stringify({ query: "select 1 as ok" }),
    });

    return {
      keySource,
      present: true,
      accepted: response.ok,
      status: response.status,
      authScheme: response.headers.get("www-authenticate")?.slice(0, 120) || null,
      server: response.headers.get("server")?.slice(0, 80) || null,
    };
  } catch (error) {
    return {
      keySource,
      present: true,
      accepted: false,
      status: null,
      error: error instanceof Error ? error.message.slice(0, 180) : "probe_failed",
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (process.env.NODE_ENV !== "production" || !ACCESS_KEY || searchParams.get("key") !== ACCESS_KEY) {
    return new NextResponse(null, { status: 404 });
  }

  const baseUrl = baseSupabaseUrl();

  const keyProbes = [] as Array<Record<string, unknown>>;
  for (const keySource of KEY_ENV_NAMES) {
    keyProbes.push(await probe(baseUrl, keySource, clean(process.env[keySource])));
  }

  const directDb = Object.fromEntries(DB_ENV_NAMES.map((name) => [name, Boolean(clean(process.env[name]))]));

  return NextResponse.json({
    ok: true,
    keyProbes,
    directDb,
  }, {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
}
