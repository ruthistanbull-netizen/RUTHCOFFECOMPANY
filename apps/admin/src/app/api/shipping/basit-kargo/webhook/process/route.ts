import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { processShippingWebhookInbox } from "@/lib/shippingWebhookProcessor";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bearer(request: Request) {
  const header = clean(request.headers.get("authorization"));
  const match = header.match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1]);
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function authorizedSupabase(request: Request) {
  const expected = clean(process.env.COMMERCE_WORKER_SECRET) || clean(process.env.CRON_SECRET);
  const supplied = bearer(request) || clean(request.headers.get("x-commerce-worker-secret"));
  if (expected && supplied && constantTimeEqual(expected, supplied)) {
    return { supabase: getSupabaseAdmin(), actor: "worker-secret" };
  }

  const admin = await requireAdmin(request);
  if ("error" in admin) return { error: admin.error };
  return { supabase: admin.supabase, actor: `admin:${admin.profile?.id || admin.user.id}` };
}

async function run(request: Request) {
  const auth = await authorizedSupabase(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 20);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 20;

  try {
    const summary = await processShippingWebhookInbox(auth.supabase, {
      workerId: `shipping-api:${auth.actor}:${crypto.randomUUID()}`,
      limit,
    });
    return NextResponse.json({ ok: true, summary }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Kargo webhook kuyruğu işlenemedi." },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
