import type { Product } from "@/types/site";

function lower(value: string) {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => {
      const hasTurkishChars = /[çğıöşüÇĞİÖŞÜ]/.test(part);
      const lowerPart = hasTurkishChars ? part.slice(1).toLocaleLowerCase("tr-TR") : part.slice(1).toLocaleLowerCase("en-US");
      return part.charAt(0).toLocaleUpperCase("en-US") + lowerPart;
    })
    .join(" ");
}

function normalizeSlug(value: string | null | undefined) {
  return lower(value || "").replace(/_/g, "-").replace(/\s+/g, "-");
}

export function uniqueClean(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = value?.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;

    const key = lower(cleaned);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

const CATEGORY_LABELS: Record<string, string> = {
  ring: "Yüzük",
  rings: "Yüzük",
  yuzuk: "Yüzük",
  "yuzukler": "Yüzük",
  "yüzük": "Yüzük",
  "yüzükler": "Yüzük",
  necklace: "Kolye",
  necklaces: "Kolye",
  pendant: "Kolye",
  pendants: "Kolye",
  kolye: "Kolye",
  kolyeler: "Kolye",
  chain: "Zincir",
  chains: "Zincir",
  zincir: "Zincir",
  zincirler: "Zincir",
  bracelet: "Bileklik",
  bracelets: "Bileklik",
  bileklik: "Bileklik",
  bileklikler: "Bileklik",
  earring: "Küpe",
  earrings: "Küpe",
  kupe: "Küpe",
  kupeler: "Küpe",
  "küpe": "Küpe",
  "küpeler": "Küpe",
  set: "Set",
  sets: "Set",
  "setler": "Set",
};

const CATEGORY_SLUGS = new Set(Object.keys(CATEGORY_LABELS));

const COLLECTION_LABELS: Record<string, string> = {
  "ruth-atelier": "Ruth Atelier",
  "ruth atelier": "Ruth Atelier",
  "sun-kissed": "Sun-Kissed",
  "sun kissed": "Sun-Kissed",
  huna: "HÛNA",
  "hûna": "HÛNA",
  "nazar-collection": "Nazar Koleksiyonu",
  "nazar collection": "Nazar Koleksiyonu",
  "nazar-koleksiyonu": "Nazar Koleksiyonu",
  arya: "Arya",
  mantra: "Mantrâ",
  "mantrâ": "Mantrâ",
  "handmade-specials": "Handmade Specials",
  "handmade specials": "Handmade Specials",
  "atelier-setleri": "Atelier Setleri",
  "atelier setleri": "Atelier Setleri",
};

export function displayCategoryName(value: string | null | undefined) {
  if (!value) return null;
  const slug = normalizeSlug(value);
  const plain = lower(value).replace(/\s+/g, " ");
  return CATEGORY_LABELS[slug] || CATEGORY_LABELS[plain] || titleCase(value);
}

export function isCategoryLikeValue(value: string | null | undefined) {
  if (!value) return false;
  const slug = normalizeSlug(value);
  const plain = lower(value).replace(/\s+/g, " ");
  return CATEGORY_SLUGS.has(slug) || CATEGORY_SLUGS.has(plain);
}

export function displayCollectionName(value: string | null | undefined) {
  if (!value) return null;
  const slug = normalizeSlug(value);
  const plain = lower(value).replace(/\s+/g, " ");

  if (isCategoryLikeValue(value)) return displayCategoryName(value);
  return COLLECTION_LABELS[slug] || COLLECTION_LABELS[plain] || value.replace(/Istanbul/g, "Istanbul");
}

export function isRuthAtelierProduct(product: Product) {
  const values = [
    product.collection_id,
    product.collections?.name,
    product.collections?.slug,
    ...(product.collection_slugs || []),
    ...(product.category_names || []),
    ...(product.category_slugs || []),
  ]
    .filter(Boolean)
    .join(" ");

  const haystack = lower(values);
  return haystack.includes("ruth atelier") || haystack.includes("ruth-atelier");
}

export function productHasImage(product: Product) {
  return Boolean(
    product.main_image_url ||
      product.image_urls?.some((image) => Boolean(image && image.trim()))
  );
}

export function displayMaterial(product: Product) {
  const material = product.material?.trim();
  if (material) return material;

  if (product.name?.toLocaleLowerCase("tr-TR").includes("the trilogy of sun")) {
    return "925 Ayar Gümüş";
  }

  if (isRuthAtelierProduct(product)) return "Brass";
  return "925 Ayar Gümüş";
}

export function materialFilterValue(product: Product) {
  return displayMaterial(product) || null;
}

export function cleanColorValue(value: string | null | undefined) {
  if (!value) return null;

  const raw = value.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  const text = lower(raw);
  if (
    text === "seçenekli" ||
    text === "secenekli" ||
    text === "altın ton" ||
    text === "altin ton" ||
    text === "gold tone" ||
    text.includes("sun-kissed bez çanta") ||
    raw.length > 32
  ) {
    return null;
  }

  if (text.includes("altın kaplama") || text.includes("altin kaplama") || text.includes("24k") || text === "gold" || text === "altın" || text === "altin") {
    return "Altın Kaplama";
  }

  if (text.includes("gümüş") || text.includes("gumus") || text === "silver") {
    return "Gümüş";
  }

  const colorMap: Record<string, string> = {
    beyaz: "Beyaz",
    kirmizi: "Kırmızı",
    kırmızı: "Kırmızı",
    mavi: "Mavi",
    lacivert: "Lacivert",
    yesil: "Yeşil",
    yeşil: "Yeşil",
    siyah: "Siyah",
    pembe: "Pembe",
    mor: "Mor",
    turkuaz: "Turkuaz",
    kahverengi: "Kahverengi",
    seffaf: "Şeffaf",
    şeffaf: "Şeffaf",
  };

  return colorMap[text] || titleCase(raw);
}

function variantOptionEntries(product: Product) {
  return (product.variants || []).flatMap((variant) => Object.entries(variant.options || {}));
}

export function productColorValues(product: Product) {
  const values: string[] = [];
  const base = cleanColorValue(product.finish_color);
  if (base) values.push(base);

  for (const [name, value] of variantOptionEntries(product)) {
    const optionName = lower(name);
    if (
      optionName.includes("renk") ||
      optionName.includes("kaplama") ||
      optionName.includes("color") ||
      optionName.includes("colour")
    ) {
      const cleaned = cleanColorValue(value);
      if (cleaned) values.push(cleaned);
    }
  }

  return uniqueClean(values).sort((a, b) => a.localeCompare(b, "tr"));
}

export function productStoneValues(product: Product) {
  const values: string[] = [];

  for (const [name, value] of variantOptionEntries(product)) {
    const optionName = lower(name);
    if (optionName.includes("taş") || optionName.includes("tas") || optionName.includes("stone")) {
      const cleaned = cleanColorValue(value) || titleCase(value);
      if (cleaned) values.push(cleaned);
    }
  }

  return uniqueClean(values).sort((a, b) => a.localeCompare(b, "tr"));
}

export function productCategoryValues(product: Product) {
  const values = [
    ...(product.category_names || []),
    ...(product.category_slugs || []),
    product.collections?.name,
    product.collections?.slug,
  ].filter((value): value is string => Boolean(value && isCategoryLikeValue(value)));

  return uniqueClean(values.map(displayCategoryName)).sort((a, b) => a.localeCompare(b, "tr"));
}

export function productCollectionFilterValue(product: Product) {
  const raw = product.collections?.name || product.collections?.slug || product.collection_slugs?.[0] || null;
  if (!raw || isCategoryLikeValue(raw)) return null;
  return displayCollectionName(raw);
}

export function productSearchText(product: Product) {
  const variantText = (product.variants || [])
    .map((variant) => [variant.option_summary, ...Object.values(variant.options || {})].filter(Boolean).join(" "))
    .join(" ");

  return lower([
    product.name,
    product.short_description,
    product.description,
    product.material,
    product.finish_color,
    product.collections?.name,
    product.collections?.slug,
    ...(product.collection_slugs || []),
    ...(product.category_names || []),
    ...(product.category_slugs || []),
    variantText,
  ].filter(Boolean).join(" "));
}

export function productKindText(product: Product) {
  const haystack = lower([
    product.name,
    product.collections?.name,
    product.collections?.slug,
    ...(product.collection_slugs || []),
    ...(product.category_names || []),
    ...(product.category_slugs || []),
  ].filter(Boolean).join(" "));

  return haystack;
}

function hasKindWord(product: Product, words: string[]) {
  const text = ` ${productKindText(product).replace(/[^a-z0-9çğıöşüâêû]+/gi, " ")} `;
  return words.some((word) => text.includes(` ${word} `));
}

export function isRingProduct(product: Product) {
  return hasKindWord(product, ["ring", "rings", "yüzük", "yuzuk"]);
}

export function isChainProduct(product: Product) {
  return hasKindWord(product, ["chain", "chains", "zincir", "zincirler"]);
}

export function isNecklaceProduct(product: Product) {
  return hasKindWord(product, ["necklace", "necklaces", "pendant", "pendants", "kolye", "kolyeler"]);
}

export function isNecklaceOrChainProduct(product: Product) {
  // size_usage is an explicit merchandising choice made in the admin panel.
  // When the necklace guide is selected, do not second-guess that choice from
  // the product name/category; the guide must render on the product page.
  if (lower(product.size_usage || "") === "kolye ölçü fotoğrafı") return true;
  return isNecklaceProduct(product) || isChainProduct(product);
}

function cleanProductLine(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

function isMaterialOrFinishLine(line: string) {
  const text = lower(line);
  return (
    /^925\b/.test(text) ||
    /^24k\b/.test(text) ||
    text.includes("ayar gümüş") ||
    text.includes("ayar gumus") ||
    text.includes("gümüş") ||
    text.includes("gumus") ||
    text.includes("pirinç") ||
    text.includes("pirinc") ||
    text.includes("brass") ||
    text.includes("silver") ||
    text.includes("kaplama") ||
    text.includes("plated") ||
    text.startsWith("malzeme:") ||
    text.startsWith("materyal:") ||
    text.startsWith("renk:") ||
    text.startsWith("kaplama:") ||
    text.startsWith("zincir:")
  );
}

function isCareLine(line: string) {
  const text = lower(line);
  return (
    text.includes("bakım") ||
    text.includes("bakim") ||
    text.includes("parfüm") ||
    text.includes("parfum") ||
    text.includes("dezenfektan") ||
    text.includes("kimyasal") ||
    text.includes("sıvı") ||
    text.includes("sivi") ||
    text.includes("su ve") ||
    text.includes("kutusunda sakla") ||
    text.includes("kapalı bir kutuda") ||
    text.includes("kapali bir kutuda")
  );
}

export function cleanedProductDescription(product: Product) {
  const description = product.description || product.short_description || "";
  const lines = description
    .split(/\r?\n+/)
    .map(cleanProductLine)
    .filter(Boolean);

  const result: string[] = [];
  let skipCareBlock = false;

  for (const line of lines) {
    const text = lower(line);

    if (text === "öne çıkanlar" || text === "one cikanlar" || text === "kısa bakım notu" || text === "kisa bakim notu") {
      if (text.includes("bak")) skipCareBlock = true;
      continue;
    }

    if (skipCareBlock) {
      if (isCareLine(line)) continue;
      skipCareBlock = false;
    }

    if (isMaterialOrFinishLine(line) || isCareLine(line)) continue;
    result.push(line.replace(/Istanbul/g, "Istanbul"));
  }

  return uniqueClean(result).join("\n\n");
}

function hasGoldFinish(product: Product) {
  const text = lower([
    product.finish_color,
    product.material_note,
    product.short_description,
    product.description,
  ].filter(Boolean).join(" "));

  return text.includes("altın") || text.includes("altin") || text.includes("gold") || text.includes("24k") || text.includes("kaplama") || text.includes("plated");
}

export function productMaterialDetails(product: Product) {
  const atelier = isRuthAtelierProduct(product);
  const goldFinish = hasGoldFinish(product);

  if (atelier) {
    return goldFinish ? "Brass üzeri altın kaplama." : "Brass.";
  }

  return goldFinish ? "925 ayar gümüş üzeri altın kaplama." : "925 ayar gümüş.";
}

export function productCareDetails(_product: Product) {
  return "Parfüm, su ve kimyasal temasından kaçın. Kullanmadığında kutusunda sakla.";
}
