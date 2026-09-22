export function normalizeProductImageUrl(value?: string | null) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) return raw;
  if (raw.startsWith("/")) return raw;

  const cleaned = raw.replace(/^public\//, "").replace(/^\/+/, "");

  const candidates = [
    `/${cleaned}`,
    `/products/${cleaned}`,
    `/images/${cleaned}`,
    `/uploads/${cleaned}`,
    `/ikas/${cleaned}`,
  ];

  return candidates[0];
}

export function productImageCandidates(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) continue;
    const raw = String(value).trim();
    if (!raw) continue;

    const cleaned = raw.replace(/^public\//, "").replace(/^\/+/, "");
    const list = [
      normalizeProductImageUrl(raw),
      `/${cleaned}`,
      `/products/${cleaned}`,
      `/images/${cleaned}`,
      `/uploads/${cleaned}`,
      `/ikas/${cleaned}`,
    ].filter(Boolean) as string[];

    for (const item of list) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }

  result.push("/panel-r-logo.png");
  return result;
}
