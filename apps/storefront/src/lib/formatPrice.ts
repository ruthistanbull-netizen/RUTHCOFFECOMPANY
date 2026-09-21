import type { Product } from "@/types/site";

function groupedAmount(number: number) {
  const sign = number < 0 ? "-" : "";
  const [whole = "0", decimals = "00"] = Math.abs(number).toFixed(2).split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${groupedWhole}.${decimals}`;
}

export function formatPrice(price: Product["price"], currency = "TRY") {
  if (price === null || price === undefined || price === "") return "";

  const number = Number(price);
  if (Number.isNaN(number)) return String(price);

  const amount = groupedAmount(number);
  if (currency === "TRY") return `${amount} TL`;

  return `${amount} ${currency}`;
}
