import { renderRostaPanelIcon } from "@/lib/rostaPanelIcon";

export const runtime = "nodejs";

const ALLOWED_SIZES = new Set([32, 180, 192, 512]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size: rawSize } = await context.params;
  const size = Number(rawSize);

  if (!Number.isInteger(size) || !ALLOWED_SIZES.has(size)) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = await renderRostaPanelIcon(size);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
