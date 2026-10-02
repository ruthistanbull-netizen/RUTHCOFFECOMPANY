import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function saveContactMessage(request: Request, message: { name: string; email: string; phone: string; message: string }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const salt = process.env.CONTACT_IP_HASH_SALT || "rosta-contact-rate-limit-v1";
  try {
    const { data, error } = await getSupabaseAdmin().rpc("submit_contact_message", {
      p_name: message.name, p_email: message.email, p_phone: message.phone || null,
      p_message: message.message,
      p_ip_hash: crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex"),
      p_user_agent: (request.headers.get("user-agent") || "").trim().slice(0, 500),
    });
    if (error) {
      if (String(error.message).includes("contact_rate_limited")) return NextResponse.json({ ok: false, error: "Çok fazla mesaj gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin." }, { status: 429 });
      throw error;
    }
    if (typeof data !== "string" || !data) throw new Error("Contact submission did not return a saved message ID");
    return NextResponse.json({ ok: true, messageId: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Contact message could not be saved", error);
    return NextResponse.json({ ok: false, error: "Talebiniz şu anda gönderilemedi. Lütfen tekrar deneyin veya iletişim sayfasından bize ulaşın." }, { status: 503 });
  }
}
