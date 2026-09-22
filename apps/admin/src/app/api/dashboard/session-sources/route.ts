import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  // Analytics kaynak tablosu eklenene kadar exact Ruth dashboard bileşeni
  // boş-state tasarımını kullanır; sahte trafik üretilmez.
  return NextResponse.json(
    { ok: true, total: 0, sources: [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
