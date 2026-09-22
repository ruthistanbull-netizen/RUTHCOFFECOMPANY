import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email || auth.profile?.email || null,
      full_name: auth.profile?.full_name || null,
      role: auth.profile?.role || "admin",
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
