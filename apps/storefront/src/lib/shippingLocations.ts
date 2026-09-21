export type ShippingLocation = {
  province: string;
  districts: string[];
};

export function normalizeTurkishLocation(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

export function findShippingProvince(locations: ShippingLocation[], value: unknown) {
  const key = normalizeTurkishLocation(value);
  return locations.find((location) => normalizeTurkishLocation(location.province) === key) || null;
}

export function findShippingDistrict(
  location: ShippingLocation | null,
  value: unknown,
) {
  if (!location) return "";
  const key = normalizeTurkishLocation(value);
  return location.districts.find((district) => normalizeTurkishLocation(district) === key) || "";
}
