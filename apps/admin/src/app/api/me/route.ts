import { NextResponse } from "next/server";
import { ADMIN_CONTINUITY_COOKIE, mintAdminContinuity } from "@/lib/adminContinuity";
import { bearerToken, requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const response = NextResponse.json({
    ok: true,
    profile: auth.profile,
    email: auth.user.email,
    authSource: auth.authSource,
    resilientSession: !auth.internal,
  });

  const token = bearerToken(request);
  if (!auth.internal && !auth.continuity && token) {
    const continuity = mintAdminContinuity(request, token, auth.user, auth.profile);
    if (continuity) {
      response.cookies.set(ADMIN_CONTINUITY_COOKIE, continuity.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(continuity.expiresAt),
      });
    }
  }

  response.headers.set("X-ROSTA-Auth-Source", auth.authSource);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
