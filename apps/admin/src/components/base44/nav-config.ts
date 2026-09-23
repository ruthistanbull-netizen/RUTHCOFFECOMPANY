import {
  Activity,
  BadgePercent,
  BarChart3,
  BellRing,
  Boxes,
  CircleDollarSign,
  Contact,
  CreditCard,
  FileText,
  Filter,
  Gauge,
  HeartHandshake,
  LayoutDashboard,
  Layers,
  Mail,
  MessageSquareText,
  Mic2,
  Package,
  Palette,
  RotateCcw,
  ServerCog,
  Settings2,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type Base44NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: string;
  aliases?: string[];
  searchTerms?: string[];
};

export type Base44NavGroup = {
  label: string;
  items: Base44NavItem[];
};

export const base44NavStructure: Base44NavGroup[] = [
  {
    label: "Genel Bakış",
    items: [{ label: "Kontrol Merkezi", href: "/", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Siparişler",
    items: [
      { label: "Tüm Siparişler", href: "/orders", icon: ShoppingBag },
      { label: "Ödeme Kontrolü", href: "/payments", icon: CreditCard },
      { label: "Üretim Kuyruğu", href: "/orders?queue=preparing", icon: Activity },
      { label: "Paketleme Kuyruğu", href: "/orders?queue=ready", icon: Package },
      { label: "Kargo Kuyruğu", href: "/shipping", icon: Truck },
      { label: "İade ve Değişim", href: "/returns", icon: RotateCcw },
    ],
  },
  {
    label: "Ürünler",
    items: [
      { label: "Tüm Ürünler", href: "/products", icon: Boxes },
      { label: "Kategori ve Koleksiyonlar", href: "/catalog", icon: Layers, aliases: ["/categories", "/collections"] },
      { label: "Stok Yönetimi", href: "/products?view=inventory", icon: Package },
      { label: "Fiyatlandırma", href: "/products?view=pricing", icon: CircleDollarSign },
      { label: "Toplu Düzenleme", href: "/products?view=bulk", icon: Filter },
    ],
  },
  {
    label: "Müşteriler",
    items: [
      { label: "Müşteri Listesi", href: "/customers", icon: Contact },
      { label: "Segmentler", href: "/customers?view=segments", icon: Filter },
      { label: "CRM Aktivitesi", href: "/crm", icon: HeartHandshake },
      { label: "ROSTA Points", href: "/rosta-points", icon: Star },
    ],
  },
  {
    label: "Pazarlama",
    items: [
      { label: "Kampanyalar", href: "/marketing", icon: BadgePercent, aliases: ["/discounts"] },
      { label: "E-posta", href: "/email", icon: Mail },
      { label: "Terk Edilmiş Sepetler", href: "/abandoned-carts", icon: ShoppingCart },
      { label: "Yorumlar", href: "/reviews", icon: MessageSquareText },
    ],
  },
  {
    label: "Meta Reklamları",
    items: [
      { label: "Meta Reklamları", href: "/meta-ads", icon: BarChart3, exact: true, badge: "META" },
      { label: "Meta Katalogları", href: "/meta-ads/catalogs", icon: Layers, exact: true, badge: "META" },
      { label: "Ruthie Reklam Analizi", href: "/meta-ads/analysis", icon: Sparkles, badge: "AI" },
    ],
  },
  {
    label: "Mağaza",
    items: [
      { label: "Tema ve Site Ayarları", href: "/settings", icon: Palette, aliases: ["/theme"] },
      { label: "Bildirimler", href: "/notifications", icon: BellRing },
      { label: "İçerik ve CMS", href: "/settings?section=content", icon: FileText },
    ],
  },
  {
    label: "Ruthie",
    items: [
      { label: "Ruthie Chat", href: "/ruthie/chat", icon: Sparkles, badge: "AI" },
      { label: "Ruthie Asistan", href: "/ruthie/voice", icon: Mic2 },
    ],
  },
  {
    label: "Sistem",
    items: [
      { label: "Ayarlar", href: "/settings", icon: Settings2 },
      { label: "Servis Sağlığı", href: "/system", icon: ServerCog },
      { label: "Kargo İstisnaları", href: "/shipping/operations", icon: Shield },
    ],
  },
];

export const base44MobileNav: Base44NavItem[] = [
  { label: "Merkez", href: "/", icon: Gauge, exact: true },
  { label: "Sipariş", href: "/orders", icon: ShoppingBag },
  { label: "Ürünler", href: "/products", icon: Boxes },
  { label: "Ruthie", href: "/ruthie/chat", icon: Sparkles, aliases: ["/ruthie/voice"] },
  { label: "Daha Fazla", href: "/settings", icon: Settings2 },
];

export const base44AllNavItems = base44NavStructure.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);

function pathnameOnly(href: string) {
  return href.split("?")[0] || "/";
}

export function base44ItemIsActive(pathname: string, item: Base44NavItem) {
  const target = pathnameOnly(item.href);
  if (item.exact || target === "/") return pathname === target;
  if (pathname === target || pathname.startsWith(`${target}/`)) return true;
  return (item.aliases || []).some((alias) => pathname === alias || pathname.startsWith(`${alias}/`));
}

export function base44CurrentItem(pathname: string) {
  return base44AllNavItems.find((item) => base44ItemIsActive(pathname, item)) || base44AllNavItems[0];
}
