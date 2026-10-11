import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public readiness + immutable brand identity. Never return Supabase URLs,
// tokens, tenant identifiers, internal health details, or customer data.
export async function GET() {
  return NextResponse.json(
    { ok: true, brand: "rosta", service: "rr-hub-admin", apiVersion: 1 },
    { headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    } }
  );
}
