import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_SESSIONS_PER_MINUTE = 6;
const liveTokenWindows = new Map<string, { started: number; count: number }>();

function json(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders() });
}
function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}
function jwt(
  key: string, secret: string, room: string, identity: string,
  displayName: string, agentName: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: key, sub: identity, name: displayName, iat: now, nbf: now - 2,
    exp: now + 600,
    video: {
      roomJoin: true, room, canPublish: true, canSubscribe: true,
      canPublishData: true, canPublishSources: ["microphone"],
    },
    roomConfig: {
      agents: [{
        agentName,
        metadata: JSON.stringify({
          surface: "rrhub-ios",
          brand: "rosta",
          displayName,
          version: "voice-v1",
        }),
      }],
    },
  }));
  const message = header + "." + claims;
  const signature = createHmac("sha256", secret).update(message).digest();
  return message + "." + base64url(signature);
}

/**
 * Only an authenticated ROSTA admin can request a room token.
 * Secret keys stay on the panel server. No Supabase bearer token is
 * transferred to LiveKit or stored in room metadata.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  if (process.env.RUNA_LIVEKIT_ENABLED !== "true") {
    return json({ ok: false, code: "RUNA_LIVEKIT_DISABLED" }, 503);
  }

  const serverUrl = String(process.env.LIVEKIT_URL || "").trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || "").trim();
  const agentName = "runa-gemini-panel";
  if (agentName === "runa-gemini-panel" &&
      (process.env.RUNA_PANEL_PLANNER !== "gemini" ||
        process.env.RUNA_GEMINI_PAID_DATA_MODE !== "true" ||
        !process.env.GOOGLE_API_KEY?.trim())) {
    return json({ ok: false, code: "RUNA_LIVEKIT_NOT_CONFIGURED" }, 503);
  }
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
    if (parsed.protocol !== "wss:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !parsed.hostname ||
        !apiKey || apiSecret.length < 20 || !/^[a-zA-Z0-9_-]{1,64}$/.test(agentName)) {
      throw new Error("missing livekit configuration");
    }
  } catch {
    return json({ ok: false, code: "RUNA_LIVEKIT_NOT_CONFIGURED" }, 503);
  }

  const actor = String(auth.profile.id);
  const time = Date.now();
  const hit = liveTokenWindows.get(actor);
  if (!hit || time - hit.started >= WINDOW_MS) {
    liveTokenWindows.set(actor, { started: time, count: 1 });
  } else {
    if (++hit.count > MAX_SESSIONS_PER_MINUTE) {
      return json({ ok: false, code: "RUNA_LIVEKIT_RATE_LIMIT" }, 429);
    }
  }
  if (liveTokenWindows.size > 250) {
    for (const [id, row] of liveTokenWindows) {
      if (time - row.started > 2 * WINDOW_MS) liveTokenWindows.delete(id);
    }
  }

  // A fresh room triggers exactly one named LiveKit agent dispatch.
  const room = "runa-" + randomUUID();
  const identity = "admin-" + randomUUID();
  const displayName = String(auth.profile.full_name || "RR HUB").trim().slice(0, 80);
  const token = jwt(apiKey, apiSecret, room, identity, displayName, agentName);
  return json({
    ok: true, server_url: parsed.toString(),
    participant_token: token,
    room_name: room,
    expires_in_seconds: 600,
    agent: agentName,
  }, 201);
}
