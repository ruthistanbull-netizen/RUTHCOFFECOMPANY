import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_KEY = String(process.env.PHASE0_DB_RUNTIME_PROBE_KEY || "").trim();

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

function supabaseBaseUrl() {
  return normalizeSupabaseUrl(
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_PUBLIC_URL,
  );
}

function safeHost(url: string) {
  try { return new URL(url).host; } catch { return null; }
}

async function probePg(baseUrl: string, apiKey: string, keySource: string) {
  if (!apiKey) return { keySource, present: false, status: null, accepted: false };
  try {
    const response = await fetch(`${baseUrl}/pg/query?statementTimeoutSecs=5&queryTimeoutSecs=8`, {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        "x-pg-application-name": "rosta-phase0-admin-runtime-probe",
      },
      body: JSON.stringify({ query: "select 1 as ok" }),
    });
    return { keySource, present: true, status: response.status, accepted: response.ok };
  } catch (error) {
    return {
      keySource,
      present: true,
      status: null,
      accepted: false,
      error: error instanceof Error ? error.message.slice(0, 180) : "probe_failed",
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (process.env.NODE_ENV !== "production" || !ACCESS_KEY || searchParams.get("key") !== ACCESS_KEY) {
    return new NextResponse(null, { status: 404 });
  }

  const baseUrl = supabaseBaseUrl();
  const keyProbes = [] as Array<Record<string, unknown>>;
  for (const keySource of KEY_ENV_NAMES) {
    keyProbes.push(await probePg(baseUrl, clean(process.env[keySource]), keySource));
  }

  const dbEnvPresence = Object.fromEntries(
    DB_ENV_NAMES.map((name) => [name, Boolean(clean(process.env[name]))]),
  );

  return NextResponse.json({
    ok: true,
    environment: {
      runtime: "admin",
      supabaseHost: safeHost(baseUrl),
      zeabur: Boolean(clean(process.env.ZEABUR_SERVICE_ID) || clean(process.env.ZEABUR_PROJECT_ID)),
    },
    keyProbes,
    dbEnvPresence,
  }, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
