"use client";

import Link from "next/link";
import { ArrowRight, Coins, Crown, RefreshCw, ShoppingBag, UserPlus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactAvatar, ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type Customer = { id: string; full_name: string | null; email: string | null; phone: string | null; is_member: boolean; reward_points_balance: number; order_count: number; paid_order_count: number; total_spent: number; last_order_at: string | null; city: string | null };
type SegmentKey = "vip" | "loyal" | "new" | "inactive" | "points" | "guest";
type Segment = { key: SegmentKey; label: string; description: string; icon: typeof UsersRound; predicate: (customer: Customer) => boolean };
function nameOf(customer: Customer) { return customer.full_name || customer.email || customer.phone || "İsimsiz müşteri"; }
function money(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value || 0)); }
function daysSince(value?: string | null) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? Infinity : Math.floor((Date.now() - date.getTime()) / 86_400_000); }
const segments: Segment[] = [
  { key: "vip", label: "VIP Müşteriler", description: "Toplam harcaması 10.000 TL ve üzeri", icon: Crown, predicate: (customer) => customer.total_spent >= 10_000 },
  { key: "loyal", label: "Sadık Müşteriler", description: "En az 3 tamamlanmış sipariş", icon: ShoppingBag, predicate: (customer) => customer.paid_order_count >= 3 },
  { key: "new", label: "Yeni Müşteriler", description: "Son 30 günde ilk siparişini verenler", icon: UserPlus, predicate: (customer) => customer.order_count > 0 && daysSince(customer.last_order_at) <= 30 },
  { key: "inactive", label: "Pasif Müşteriler", description: "90 gündür sipariş vermeyenler", icon: UsersRound, predicate: (customer) => customer.order_count > 0 && daysSince(customer.last_order_at) > 90 },
  { key: "points", label: "Puan Bakiyesi Olanlar", description: "Ruthie Points bakiyesi sıfırdan büyük", icon: Coins, predicate: (customer) => customer.reward_points_balance > 0 },
  { key: "guest", label: "Üye Olmayanlar", description: "Misafir alışveriş yapan müşteriler", icon: UsersRound, predicate: (customer) => !customer.is_member },
];

export function ExactSegments() {
  const toast = useExactToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<SegmentKey>("vip");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const result = await adminRequest<{ customers?: Customer[] }>("/api/customers/list?page=1&pageSize=500&membership=all&sort=spent"); setCustomers(result.customers || []); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Müşteri segmentleri alınamadı."); } finally { setLoading(false); } }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const currentSegment = segments.find((segment) => segment.key === selectedSegment) || segments[0];
  const CurrentIcon = currentSegment.icon;
  const visible = useMemo(() => { const needle = query.trim().toLocaleLowerCase("tr-TR"); return customers.filter(currentSegment.predicate).filter((customer) => !needle || `${nameOf(customer)} ${customer.email || ""} ${customer.phone || ""} ${customer.city || ""}`.toLocaleLowerCase("tr-TR").includes(needle)); }, [currentSegment, customers, query]);
  const segmentCounts = useMemo(() => Object.fromEntries(segments.map((segment) => [segment.key, customers.filter(segment.predicate).length])) as Record<SegmentKey, number>, [customers]);
  const columns: ExactColumn<Customer>[] = [
    { key: "full_name", label: "Müşteri", sortable: true, render: (customer) => <div className="flex items-center gap-2"><ExactAvatar name={nameOf(customer)} size="sm" /><div><p className="text-sm font-medium text-main">{nameOf(customer)}</p><p className="text-[10px] text-subtle">{customer.email || customer.phone || "İletişim yok"}</p></div></div> },
    { key: "total_spent", label: "Toplam Harcama", sortable: true, align: "right", render: (customer) => <span className="font-semibold text-main">{money(customer.total_spent)}</span> },
    { key: "paid_order_count", label: "Sipariş", sortable: true, align: "right", render: (customer) => <span className="text-muted">{customer.paid_order_count}</span> },
    { key: "reward_points_balance", label: "Puan", align: "right", render: (customer) => <span className="text-accent font-medium">{customer.reward_points_balance.toLocaleString("tr-TR")}</span> },
    { key: "is_member", label: "Üyelik", align: "center", render: (customer) => <ExactStatusBadge status={customer.is_member ? "active" : "archived"} label={customer.is_member ? "Üye" : "Misafir"} size="sm" /> },
    { key: "city", label: "Şehir", render: (customer) => <span className="text-xs text-muted">{customer.city || "—"}</span> },
  ];
  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="segments">
    <ExactPageHeader title="Müşteri Segmentleri" subtitle="Davranış ve değere göre otomatik müşteri grupları" actions={<><Link href={`/email/customers?segment=${selectedSegment}`}><ExactButton size="sm">Segmente e-posta gönder <ArrowRight className="h-4 w-4" /></ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /></>} />
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">{segments.map((segment) => <button key={segment.key} type="button" onClick={() => setSelectedSegment(segment.key)}><ExactMetricCard label={segment.label} value={segmentCounts[segment.key] || 0} icon={segment.icon} className={selectedSegment === segment.key ? "ring-2 ring-accent" : ""} /></button>)}</div>
    <ExactDataCard><div className="flex items-start gap-3"><div className="flex items-center justify-center h-10 w-10 radius-small bg-accent-soft text-accent"><CurrentIcon className="h-5 w-5" /></div><div><h3 className="text-sm font-semibold text-main">{currentSegment.label}</h3><p className="text-xs text-muted mt-1">{currentSegment.description}. Bu segment gerçek müşteri ve sipariş verisinden otomatik hesaplanır.</p></div></div></ExactDataCard>
    <ExactSearchInput value={query} onChange={setQuery} placeholder="Segment içinde müşteri ara..." />
    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} emptyState={<ExactEmptyState icon={UsersRound} title="Bu segmentte müşteri yok" />} />}
  </div>;
}
