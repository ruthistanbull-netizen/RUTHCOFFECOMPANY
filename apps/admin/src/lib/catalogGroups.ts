function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function slugifyCatalogValue(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/û/g, "u")
    .replace(/î/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ürün formundan gelen kategori/koleksiyon değerini gerçek veritabanı UUID'sine çevirir.
 * Bu sistem otomatik/sanal kategori üretmez; yalnızca panelden önceden oluşturulmuş kayıtlar kullanılabilir.
 */
export async function resolveCatalogId(
  supabase: any,
  table: "categories" | "collections",
  idOrSlug: string,
) {
  const raw = clean(idOrSlug);
  if (!raw) return null;

  let query = supabase
    .from(table)
    .select("id, name, slug, status")
    .limit(1);

  if (UUID_PATTERN.test(raw)) {
    query = query.eq("id", raw);
  } else {
    const slug = slugifyCatalogValue(raw);
    if (!slug) return null;
    query = query.eq("slug", slug);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error(`${table === "categories" ? "Kategori" : "Koleksiyon"} bulunamadı. Önce Ürünler menüsünden oluştur.`);
  }
  if (data.status && data.status !== "active") {
    throw new Error(`${table === "categories" ? "Kategori" : "Koleksiyon"} aktif değil.`);
  }

  return String(data.id);
}
