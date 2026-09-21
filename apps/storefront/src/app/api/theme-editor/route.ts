import { NextResponse } from "next/server";
import { getThemeCustomizerSettings } from "@/data/site";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getThemeCustomizerSettings();
  return NextResponse.json({ ok: true, settings }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
