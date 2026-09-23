import {
  Activity,
  AudioWaveform,
  BarChart,
  Brush,
  CircleUserRound,
  ClipboardPlus,
  Contact,
  CreditCard,
  FileText,
  Filter,
  Handshake,
  HeartPulse,
  History,
  Inbox,
  Landmark,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Megaphone,
  MessageSquareText,
  Package,
  PackageOpen,
  PackagePlus,
  Palette,
  Percent,
  Plug,
  RotateCcw,
  Settings2,
  Shield,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Target,
  Truck,
  UserCog,
  Warehouse,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";

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
      { label: "Sepetler", path: "/cart-activity", icon: ShoppingCart, exact: true },
      { label: "Hazırlanacak Ürünler", path: "/preparing-products", icon: ListChecks, exact: true },
      { label: "Terk Edilen Sepetler", path: "/abandoned-carts", icon: History, exact: true },
      { label: "Manuel Sipariş Oluştur", path: "/orders/new", icon: ClipboardPlus },
      { label: "Ödemeler", path: "/payments", icon: CreditCard },
      { label: "Hakedişler", path: "/settlements", icon: Landmark, exact: true },
      { label: "Kargo", path: "/shipping", icon: Truck },
      { label: "İade ve Değişim", path: "/returns", icon: RotateCcw },
    ],
  },
  {
    label: "ÜRÜN VE STOK",
    items: [
      { label: "Ürünler", path: "/products", icon: Package, exact: true },
      { label: "Ürün Oluştur", path: "/products/studio?type=single", icon: PackagePlus },
      { label: "Paket Ürün Oluştur", path: "/products/studio?type=bundle", icon: PackageOpen },
      { label: "Ürün Düzenleme Stüdyosu", path: "/products/studio", icon: SlidersHorizontal },
      { label: "Kategori ve Koleksiyonlar", path: "/catalog", icon: Layers },
      { label: "Stok Yönetimi", path: "/inventory", icon: Warehouse },
      { label: "Fiyatlandırma", path: "/pricing", icon: Tag },
      { label: "Toplu Düzenleme", path: "/bulk-edit", icon: ListTodo },
    ],
  },
  {
    label: "MÜŞTERİ",
    items: [
      { label: "Müşteriler", path: "/customers", icon: Contact },
      { label: "Segmentler", path: "/segments", icon: Filter },
      { label: "CRM", path: "/crm", icon: Handshake },
      { label: "ROSTA Points", path: "/rosta-points", icon: Star },
      { label: "Yorum ve Değerlendirmeler", path: "/reviews", icon: MessageSquareText },
    ],
  },
  {
    label: "PAZARLAMA",
    items: [
      { label: "Pazarlama", path: "/marketing", icon: Megaphone },
      { label: "E-posta Merkezi", path: "/email", icon: Inbox, exact: true },
      { label: "E-posta Şablonları", path: "/email/templates", icon: FileText },
      { label: "E-posta Otomasyonları", path: "/email/automations", icon: Workflow },
      { label: "İndirimler", path: "/discounts", icon: Percent },
    ],
  },
  {
    label: "Meta Reklamları",
    items: [
      { label: "Meta Reklamları", path: "/meta-ads", icon: Target, exact: true, badge: "META" },
      { label: "Meta Katalogları", path: "/meta-ads/catalogs", icon: Layers, exact: true, badge: "META" },
      { label: "Ruthie Reklam Analizi", path: "/meta-ads/analysis", icon: Sparkles, badge: "AI" },
    ],
  },
  {
    label: "MAĞAZA",
    items: [{ label: "Mağaza Tasarımı", path: "/theme", icon: Palette, aliases: ["/storefront"] }],
  },
  {
    label: "RAPORLAMA",
    items: [{ label: "Analitik", path: "/analytics", icon: BarChart }],
  },
  {
    label: "Ruthie",
    items: [
      { label: "Ruthie Chat", path: "/ruthie/chat", icon: RuthieBrandIcon, badge: "AI" },
      { label: "Ruthie Asistan", path: "/ruthie/voice", icon: AudioWaveform },
    ],
  },
  {
    label: "SİSTEM",
    items: [
      { label: "Hesabım", path: "/account", icon: CircleUserRound },
      { label: "Ayarlar", path: "/settings", icon: Settings2, exact: true },
      { label: "Kullanıcılar ve Roller", path: "/settings/users", icon: UserCog },
      { label: "Entegrasyonlar", path: "/settings/integrations", icon: Plug },
      { label: "Servis Sağlığı", path: "/system", icon: HeartPulse },
      { label: "Güvenlik", path: "/settings/security", icon: Shield },
      { label: "Görünüm", path: "/settings/appearance", icon: Brush },
    ],
  },
];

export const exactMobileNav: ExactNavItem[] = [
  { label: "Genel", path: "/", icon: LayoutDashboard, exact: true },
  { label: "Siparişler", path: "/orders", icon: ShoppingBag, aliases: ["/cart-activity", "/abandoned-carts", "/preparing-products"] },
  { label: "Ürünler", path: "/products", icon: Package },
  { label: "Müşteriler", path: "/customers", icon: Contact },
  { label: "E-posta", path: "/email", icon: Inbox },
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
