import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.redirect(
    new URL("/home/rosta-hero-current.webp?v=20260921-rosta", request.url),
    {
      status: 307,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
