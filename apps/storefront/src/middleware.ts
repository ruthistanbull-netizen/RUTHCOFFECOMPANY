import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/order-tracking") {
    const target = request.nextUrl.clone();
    target.pathname = "/siparis-takip";
    return NextResponse.redirect(target, 308);
  }

  const isInternalPath =
    request.nextUrl.pathname.startsWith("/internal/") ||
    request.nextUrl.pathname.startsWith("/api/catalog-debug");
  if (!isInternalPath) return NextResponse.next();

  const isProduction = process.env.NODE_ENV === "production";
  const internalQaEnabled = process.env.PHASE1E_INTERNAL_QA === "1";
  if (!isProduction || internalQaEnabled) return NextResponse.next();

  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|mp4|png|svg|webm|webp|woff2?|ttf|otf)$).*)",
  ],
};
