import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 60 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/avif","video/mp4","video/webm","video/quicktime"]);

function safeName(value: string) {
  return value.toLocaleLowerCase("tr-TR")
    .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120) || "media";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const folder = safeName(String(form?.get("folder") || "uploads"));
  if (!(file instanceof File)) return NextResponse.json({ ok:false, error:"Dosya bulunamadı." }, { status:400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ ok:false, error:"Desteklenmeyen dosya türü." }, { status:400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ ok:false, error:"Dosya en fazla 60 MB olabilir." }, { status:400 });

  const ext = safeName(file.name.split(".").pop() || (file.type.startsWith("video/") ? "mp4" : "webp"));
  const base = safeName(file.name.replace(/\.[^.]+$/, ""));
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${base}.${ext}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await auth.supabase.storage.from("rosta-media").upload(path, bytes, {
    contentType:file.type,
    cacheControl:"31536000",
    upsert:false,
  });
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });

  const { data } = auth.supabase.storage.from("rosta-media").getPublicUrl(path);
  return NextResponse.json({ ok:true, path, url:data.publicUrl });
}
