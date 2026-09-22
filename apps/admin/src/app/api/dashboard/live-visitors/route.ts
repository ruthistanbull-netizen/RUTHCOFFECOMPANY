import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  // ROSTA henüz canlı ziyaretçi heartbeat'i üretmiyorsa tasarım aynı kalır,
  // sayaç güvenli biçimde 0 gösterir.
  return NextResponse.json(
    { ok: true, activeVisitors: 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
