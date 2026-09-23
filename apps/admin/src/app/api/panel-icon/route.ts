import { renderRostaPanelIcon } from "@/lib/rostaPanelIcon";

export const runtime = "nodejs";
export const dynamic = "force-static";

export async function GET() {
  const bytes = await renderRostaPanelIcon(180);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
