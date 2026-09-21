import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "www.ruthistanbul.com";
const LEGACY_HOSTS = new Set(["ruthistanbull.tr", "www.ruthistanbull.tr"]);

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (LEGACY_HOSTS.has(host)) {
    const target = request.nextUrl.clone();
    target.protocol = "https";
    target.host = CANONICAL_HOST;
    if (target.pathname === "/order-tracking") target.pathname = "/siparis-takip";
    return NextResponse.redirect(target, 308);
  }

  if (request.nextUrl.pathname === "/order-tracking") {
    const target = request.nextUrl.clone();
    target.pathname = "/siparis-takip";
    return NextResponse.redirect(target, 308);
  }

  if (request.nextUrl.pathname === "/necklace-size-guide.jpg") {
    const target = request.nextUrl.clone();
    target.pathname = "/api/necklace-size-guide";
    return NextResponse.rewrite(target);
  }

  const isInternalPath =
    request.nextUrl.pathname.startsWith("/internal/") ||
    request.nextUrl.pathname.startsWith("/api/catalog-debug");
  if (!isInternalPath) return NextResponse.next();

  const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
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
    "/necklace-size-guide.jpg",
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|mp4|png|svg|webm|webp|woff2?|ttf|otf)$).*)",
  ],
};
