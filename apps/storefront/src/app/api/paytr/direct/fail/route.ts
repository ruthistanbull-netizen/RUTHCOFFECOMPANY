import { NextResponse } from "next/server";

function redirectToFailure(request: Request, message = "") {
  const url = new URL(request.url);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/$/, "");
  const order = url.searchParams.get("order") || "";
  const target = new URL("/order-fail", siteUrl);
  if (order) target.searchParams.set("order", order);
  if (message) target.searchParams.set("message", message.slice(0, 300));
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  return redirectToFailure(request, String(form?.get("fail_message") || ""));
}

export async function GET(request: Request) {
  return redirectToFailure(request, new URL(request.url).searchParams.get("fail_message") || "");
}
