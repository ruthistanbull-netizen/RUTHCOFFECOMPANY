export type StructuredShippingAddress = {
  city: string;
  town: string;
  neighborhood: string;
  address: string;
  postalCode: string;
};

export type SavedCustomerAddress = {
  id?: string | null;
  profile_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  address_line?: string | null;
  postal_code?: string | null;
  is_default?: boolean | null;
  created_at?: string | null;
};

const TURKISH_PROVINCES = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir",
  "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli",
  "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari",
  "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir",
  "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir",
  "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat",
  "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
  "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce",
];

export function cleanShippingText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function first(...values: unknown[]) {
  for (const value of values) {
    const text = cleanShippingText(value);
    if (text) return text;
  }
  return "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeTurkish(value: unknown) {
  return cleanShippingText(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

const PROVINCE_BY_KEY = new Map(TURKISH_PROVINCES.map((province) => [normalizeTurkish(province), province]));

function provinceFrom(value: unknown) {
  return PROVINCE_BY_KEY.get(normalizeTurkish(value)) || "";
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && /^[+()\d\s.-]+$/.test(value);
}

function looksLikeAddressPart(value: string) {
  return /\b(mahallesi|mah\.?|sokak|sok\.?|cadde|cad\.?|bulvar|apt\.?|apartman|daire|kat|blok|no\.?|site|mevki)\b/i.test(value) || /\d/.test(value);
}

export function parseShippingAddressText(value: unknown): StructuredShippingAddress {
  const text = cleanShippingText(value);
  if (!text) return { city: "", town: "", neighborhood: "", address: "", postalCode: "" };

  const pieces = text.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  let city = "";
  let town = "";
  let postalCode = "";
  const addressPieces: string[] = [];

  for (const rawPiece of pieces) {
    if (/^(türkiye|turkey)$/i.test(rawPiece) || looksLikePhone(rawPiece)) continue;
    let piece = rawPiece;
    const postalMatch = piece.match(/(?:^|\s)(\d{5})(?:\s|$)/);
    if (postalMatch && !postalCode) postalCode = postalMatch[1];
    piece = piece.replace(/(?:^|\s)\d{5}(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
    if (!piece) continue;

    const slashMatch = piece.match(/^(.+?)\s*\/\s*([^/]+)$/);
    if (slashMatch) {
      const slashCity = provinceFrom(slashMatch[2]);
      if (slashCity) {
        town ||= slashMatch[1].trim();
        city ||= slashCity;
        continue;
      }
    }

    const tokens = piece.split(/\s+/).filter(Boolean);
    const provinceIndex = tokens.findIndex((token) => provinceFrom(token));
    if (provinceIndex >= 0) {
      city ||= provinceFrom(tokens[provinceIndex]);
      const before = tokens.slice(0, provinceIndex).join(" ").trim();
      const after = tokens.slice(provinceIndex + 1).join(" ").trim();
      if (before) {
        const beforeTokens = before.split(/\s+/).filter(Boolean);
        if (!looksLikeAddressPart(before) && beforeTokens.length <= 3) town ||= before;
        else {
          const possibleTown = beforeTokens[beforeTokens.length - 1] || "";
          if (possibleTown && !/\d/.test(possibleTown)) {
            town ||= possibleTown;
            const remaining = beforeTokens.slice(0, -1).join(" ").trim();
            if (remaining) addressPieces.push(remaining);
          } else addressPieces.push(before);
        }
      }
      if (after) addressPieces.push(after);
      continue;
    }
    addressPieces.push(piece);
  }

  let neighborhood = "";
  const neighborhoodIndex = addressPieces.findIndex((piece) => /\b(mahallesi|mah\.?)\b/i.test(piece));
  if (neighborhoodIndex >= 0) neighborhood = addressPieces.splice(neighborhoodIndex, 1)[0] || "";

  return { city, town, neighborhood, address: addressPieces.join(", "), postalCode };
}

export function resolveStructuredShippingAddress(order: Record<string, any>, savedAddress?: SavedCustomerAddress | null): StructuredShippingAddress {
  const parsed = parseShippingAddressText(order.shipping_address_text || order.shipping_address_line);
  const recipient = objectValue(order.shipping_recipient);
  const neighborhood = first(order.shipping_neighborhood, savedAddress?.neighborhood, recipient.neighborhood, parsed.neighborhood);
  let address = first(order.shipping_address_line, savedAddress?.address_line, recipient.addressLine, recipient.address, parsed.address, order.shipping_address_text);
  const rawAddress = cleanShippingText(order.shipping_address_line || order.shipping_address_text);
  if (address === rawAddress) {
    const parsedRaw = parseShippingAddressText(rawAddress);
    if (parsedRaw.address) address = parsedRaw.address;
  }
  return {
    city: first(order.shipping_city, savedAddress?.city, recipient.city, parsed.city),
    town: first(order.shipping_town, savedAddress?.district, recipient.town, parsed.town),
    neighborhood,
    address,
    postalCode: first(order.shipping_postal_code, savedAddress?.postal_code, recipient.postalCode, parsed.postalCode),
  };
}

function addressSortValue(address: SavedCustomerAddress) {
  const defaultScore = address.is_default ? 1 : 0;
  const created = address.created_at ? new Date(address.created_at).getTime() : 0;
  return defaultScore * 10_000_000_000_000 + (Number.isFinite(created) ? created : 0);
}

function normalizedPhone(value: unknown) {
  const digits = cleanShippingText(value).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizedEmail(value: unknown) {
  return cleanShippingText(value).toLocaleLowerCase("tr-TR");
}

function normalizedName(value: unknown) {
  return normalizeTurkish(value);
}

function addressMatchKey(value: unknown) {
  return normalizeTurkish(value);
}

function addCandidate(map: Map<string, SavedCustomerAddress[]>, key: unknown, address: SavedCustomerAddress) {
  const normalized = cleanShippingText(key);
  if (!normalized) return;
  const rows = map.get(normalized) || [];
  if (!rows.some((row) => cleanShippingText(row.id) === cleanShippingText(address.id))) rows.push(address);
  rows.sort((a, b) => addressSortValue(b) - addressSortValue(a));
  map.set(normalized, rows);
}

function buildAddressMaps(rows: SavedCustomerAddress[]) {
  const byId = new Map<string, SavedCustomerAddress>();
  const byProfile = new Map<string, SavedCustomerAddress[]>();
  const byEmail = new Map<string, SavedCustomerAddress[]>();
  const byPhone = new Map<string, SavedCustomerAddress[]>();
  const byNormalizedPhone = new Map<string, SavedCustomerAddress[]>();
  const byName = new Map<string, SavedCustomerAddress[]>();

  for (const address of rows) {
    const id = cleanShippingText(address.id);
    if (id) {
      const current = byId.get(id);
      if (!current || addressSortValue(address) > addressSortValue(current)) byId.set(id, address);
    }
    addCandidate(byProfile, address.profile_id, address);
    addCandidate(byEmail, normalizedEmail(address.email), address);
    addCandidate(byPhone, address.phone, address);
    addCandidate(byNormalizedPhone, normalizedPhone(address.phone), address);
    addCandidate(byName, normalizedName(address.full_name), address);
  }
  return { byId, byProfile, byEmail, byPhone, byNormalizedPhone, byName };
}

function pickMatchingAddress(order: any, candidates: SavedCustomerAddress[]) {
  if (!candidates.length) return null;
  const orderAddress = addressMatchKey(order.shipping_address_line || order.shipping_address_text);
  if (orderAddress) {
    const matched = candidates.find((candidate) => {
      const candidateAddress = addressMatchKey(candidate.address_line);
      return candidateAddress && (orderAddress.includes(candidateAddress) || candidateAddress.includes(orderAddress));
    });
    if (matched) return matched;
  }
  return candidates[0];
}

function savedAddressFor(order: any, maps: ReturnType<typeof buildAddressMaps>) {
  const candidates = [
    ...(maps.byProfile.get(cleanShippingText(order.profile_id)) || []),
    ...(maps.byEmail.get(normalizedEmail(order.customer_email)) || []),
    ...(maps.byPhone.get(cleanShippingText(order.customer_phone)) || []),
    ...(maps.byNormalizedPhone.get(normalizedPhone(order.customer_phone)) || []),
    ...(maps.byName.get(normalizedName(order.customer_name)) || []),
  ].filter((candidate, index, rows) => rows.findIndex((row) => cleanShippingText(row.id) === cleanShippingText(candidate.id)) === index);

  return maps.byId.get(cleanShippingText(order.shipping_address_id)) || pickMatchingAddress(order, candidates) || null;
}

function alreadyStructured(order: any) {
  const city = cleanShippingText(order.shipping_city);
  const town = cleanShippingText(order.shipping_town);
  const address = cleanShippingText(order.shipping_address_line || order.shipping_address_text);
  return Boolean(address && (city || town));
}

function enrichOne(order: any, maps: ReturnType<typeof buildAddressMaps>) {
  if (alreadyStructured(order)) return order;
  const savedAddress = savedAddressFor(order, maps);
  const structured = resolveStructuredShippingAddress(order, savedAddress);
  return {
    ...order,
    saved_address: savedAddress,
    shipping_city: structured.city || null,
    shipping_town: structured.town || null,
    shipping_neighborhood: structured.neighborhood || null,
    shipping_address_line: structured.address || null,
    shipping_postal_code: structured.postalCode || null,
  };
}

export async function enrichOrdersWithShippingAddresses(supabase: any, orders: any[]) {
  if (!orders.length) return orders;

  // Çoğu yeni siparişte yapılandırılmış adres zaten orders üzerinde. Bu durumda
  // müşteri adres tablosuna hiç gitmeyerek API tarafında birkaç uzak DB turunu atla.
  const targets = orders.filter((order) => !alreadyStructured(order));
  if (!targets.length) return orders;

  const addressIds = [...new Set(targets.map((order) => cleanShippingText(order.shipping_address_id)).filter(Boolean))];
  const profileIds = [...new Set(targets.map((order) => cleanShippingText(order.profile_id)).filter(Boolean))];
  const emails = [...new Set(targets.map((order) => normalizedEmail(order.customer_email)).filter(Boolean))];
  const phones = [...new Set(targets.map((order) => cleanShippingText(order.customer_phone)).filter(Boolean))];
  const names = [...new Set(targets.map((order) => cleanShippingText(order.customer_name)).filter(Boolean))];
  const select = "id, profile_id, full_name, phone, email, city, district, neighborhood, address_line, postal_code, is_default, created_at";

  const query = (column: string, values: string[]) => values.length
    ? supabase.from("customer_addresses").select(select).in(column, values)
    : Promise.resolve({ data: [], error: null });

  // Önceden bu sorgular tek tek bekleniyordu. Aynı anda çalıştırarak özellikle uzak
  // Supabase bağlantısında sipariş kartlarının ilk açılış süresini ciddi azaltır.
  const results = await Promise.all([
    query("id", addressIds),
    query("profile_id", profileIds),
    query("email", emails),
    query("phone", phones),
    query("full_name", names),
  ]);

  const collected: SavedCustomerAddress[] = results.flatMap((result: any) => result.error ? [] : (result.data || []));
  let maps = buildAddressMaps(collected);
  let enriched = new Map<string, any>();
  const unresolved: any[] = [];

  for (const order of targets) {
    const next = enrichOne(order, maps);
    enriched.set(String(order.id || order.order_no || ""), next);
    if (!alreadyStructured(next)) unresolved.push(order);
  }

  // Telefon biçimi değişmiş eski/guest siparişler için pahalı genel taramayı yalnızca
  // gerçekten direkt eşleşme bulunamadığında yap. Normal isteklerde bu sorgu hiç çalışmaz.
  if (unresolved.length) {
    const fallback = await supabase
      .from("customer_addresses")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(600);
    if (!fallback.error && fallback.data?.length) {
      maps = buildAddressMaps([...collected, ...fallback.data]);
      for (const order of unresolved) {
        enriched.set(String(order.id || order.order_no || ""), enrichOne(order, maps));
      }
    }
  }

  return orders.map((order) => enriched.get(String(order.id || order.order_no || "")) || order);
}
