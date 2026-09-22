import {
  Contact,
  Inbox,
  Layers,
  LayoutDashboard,
  Package,
  Palette,
  ShoppingBag,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type ExactNavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
  aliases?: string[];
};

export type ExactNavGroup = { label: string; items: ExactNavItem[] };

export const exactNavStructure: ExactNavGroup[] = [
  {
    label: "GENEL",
    items: [{ label: "Genel Bakış", path: "/", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "SİPARİŞ VE OPERASYON",
    items: [
      { label: "Siparişler", path: "/orders", icon: ShoppingBag, exact: true },
    ],
  },
  {
    label: "ÜRÜN VE STOK",
    items: [
      { label: "Ürünler", path: "/products", icon: Package, exact: true },
      { label: "Kategori ve Koleksiyonlar", path: "/catalog", icon: Layers, exact: true },
      { label: "Stok Yönetimi", path: "/inventory", icon: Warehouse, exact: true },
    ],
  },
  {
    label: "MÜŞTERİ",
    items: [
      { label: "Müşteriler", path: "/customers", icon: Contact, exact: true },
    ],
  },
  {
    label: "PAZARLAMA",
    items: [
      { label: "E-posta Merkezi", path: "/email", icon: Inbox, exact: true },
    ],
  },
  {
    label: "MAĞAZA",
    items: [
      { label: "Mağaza Tasarımı", path: "/theme", icon: Palette, exact: true },
    ],
  },
];

export const exactMobileNav: ExactNavItem[] = [
  { label: "Genel", path: "/", icon: LayoutDashboard, exact: true },
  { label: "Siparişler", path: "/orders", icon: ShoppingBag, exact: true },
  { label: "Ürünler", path: "/products", icon: Package, exact: true },
  { label: "Müşteriler", path: "/customers", icon: Contact, exact: true },
  { label: "E-posta", path: "/email", icon: Inbox, exact: true },
];

export const exactAllNavItems = exactNavStructure.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);

function pathOnly(path: string) {
  return path.split("?")[0] || "/";
}

export function exactItemIsActive(pathname: string, item: ExactNavItem) {
  const itemPath = pathOnly(item.path);
  if (item.exact || itemPath === "/") return pathname === itemPath;
  if (pathname === itemPath || pathname.startsWith(`${itemPath}/`)) return true;
  return (item.aliases || []).some((alias) => {
    const aliasPath = pathOnly(alias);
    return pathname === aliasPath || pathname.startsWith(`${aliasPath}/`);
  });
}

export function exactCurrentItem(pathname: string) {
  return exactAllNavItems.find((item) => exactItemIsActive(pathname, item));
}
