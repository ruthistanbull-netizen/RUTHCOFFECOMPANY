"use client";

import Link from "next/link";
import { KeyRound, Mail, Plus, RefreshCw, Save, ShieldCheck, UserCheck, UserMinus, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactDetailDrawer, ExactField, ExactFormModal, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSkeleton, ExactStatusBadge, exactFormInputClass, useExactToast } from "./primitives";
import { ExactAvatar, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type AdminRole = "owner" | "admin" | "operations" | "support" | "marketing" | "viewer";
type AdminUser = { id: string; email: string; full_name?: string | null; role: AdminRole; status?: string | null; is_active?: boolean; last_sign_in_at?: string | null; created_at?: string | null };
const roleLabels: Record<AdminRole, string> = { owner: "Sahip", admin: "Yönetici", operations: "Operasyon", support: "Müşteri Hizmetleri", marketing: "Pazarlama", viewer: "Görüntüleyici" };
function nameOf(user: AdminUser) { return user.full_name || user.email || "Panel kullanıcısı"; }
function active(user: AdminUser) { return user.is_active !== false && user.status !== "disabled" && user.status !== "inactive"; }
function dateTime(value?: string | null) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }

export function ExactUsers() {
  const toast = useExactToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState<AdminUser | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminRole>("viewer");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      let result: { users?: AdminUser[]; profiles?: AdminUser[] };
      try { result = await adminRequest("/api/admin/users"); }
      catch (primaryError) { try { result = await adminRequest("/api/users"); } catch { throw primaryError; } }
      const next = result.users || result.profiles || [];
      setUsers(next);
      setSelected((current) => current ? next.find((user) => user.id === current.id) || null : null);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Panel kullanıcıları alınamadı."); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => { const needle = query.trim().toLocaleLowerCase("tr-TR"); return users.filter((user) => !needle || `${nameOf(user)} ${user.email} ${roleLabels[user.role]}`.toLocaleLowerCase("tr-TR").includes(needle)); }, [query, users]);
  const stats = useMemo(() => ({ total: users.length, active: users.filter(active).length, admins: users.filter((user) => ["owner", "admin"].includes(user.role)).length, limited: users.filter((user) => ["viewer", "support", "marketing"].includes(user.role)).length }), [users]);
  const open = (user: AdminUser) => { setSelected(user); setDraft({ ...user }); };
  const save = async () => { if (!draft) return; setBusy("save"); try { const payload = { id: draft.id, full_name: draft.full_name, role: draft.role, status: draft.status || (draft.is_active === false ? "disabled" : "active"), is_active: active(draft) }; try { await adminRequest("/api/admin/users", { method: "PATCH", body: JSON.stringify(payload) }); } catch (primaryError) { try { await adminRequest("/api/users", { method: "PATCH", body: JSON.stringify(payload) }); } catch { throw primaryError; } } toast.success(`${nameOf(draft)} yetkileri güncellendi.`); setSelected(null); setDraft(null); await load(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Kullanıcı güncellenemedi."); } finally { setBusy(null); } };
  const invite = async () => { if (!inviteEmail.trim()) { toast.error("Davet e-posta adresi zorunlu."); return; } setBusy("invite"); const payload = { email: inviteEmail.trim(), full_name: inviteName.trim() || null, role: inviteRole }; try { try { await adminRequest("/api/admin/users/invite", { method: "POST", body: JSON.stringify(payload) }); } catch (primaryError) { try { await adminRequest("/api/users", { method: "POST", body: JSON.stringify(payload) }); } catch { throw primaryError; } } toast.success(`${inviteEmail} adresine panel daveti gönderildi.`); setInviteOpen(false); setInviteEmail(""); setInviteName(""); setInviteRole("viewer"); await load(); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Panel daveti gönderilemedi."); } finally { setBusy(null); } };
  const toggleActive = async () => { if (!draft) return; const next = { ...draft, is_active: !active(draft), status: active(draft) ? "disabled" : "active" }; setDraft(next); };
  const columns: ExactColumn<AdminUser>[] = [
    { key: "full_name", label: "Kullanıcı", sortable: true, render: (user) => <div className="flex items-center gap-2"><ExactAvatar name={nameOf(user)} size="sm" /><div><p className="ruth-type-table font-medium text-main">{nameOf(user)}</p><p className="ruth-type-caption text-subtle">{user.email}</p></div></div> },
    { key: "role", label: "Rol", align: "center", render: (user) => <ExactStatusBadge status={["owner", "admin"].includes(user.role) ? "active" : "pending"} label={roleLabels[user.role] || user.role} size="sm" /> },
    { key: "status", label: "Durum", align: "center", render: (user) => <ExactStatusBadge status={active(user) ? "active" : "archived"} label={active(user) ? "Aktif" : "Devre dışı"} size="sm" /> },
    { key: "last_sign_in_at", label: "Son Giriş", sortable: true, render: (user) => <span className="ruth-type-code text-muted">{dateTime(user.last_sign_in_at)}</span> },
    { key: "created_at", label: "Oluşturulma", render: (user) => <span className="ruth-type-code text-muted">{dateTime(user.created_at)}</span> },
  ];
  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="users">
    <ExactPageHeader title="Kullanıcılar ve Roller" subtitle="Panel erişimlerini ve operasyon yetkilerini yönet" actions={<><Link href="/settings/security"><ExactButton variant="secondary" size="sm"><KeyRound className="h-4 w-4" /> Güvenlik</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /><ExactButton size="sm" onClick={() => setInviteOpen(true)}><Plus className="h-4 w-4" /> Kullanıcı davet et</ExactButton></>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><ExactMetricCard label="Toplam Kullanıcı" value={stats.total} icon={UsersRound} /><ExactMetricCard label="Aktif Kullanıcı" value={stats.active} icon={UserCheck} /><ExactMetricCard label="Yönetici" value={stats.admins} icon={ShieldCheck} /><ExactMetricCard label="Sınırlı Yetki" value={stats.limited} icon={KeyRound} /></div>
    <ExactSearchInput value={query} onChange={setQuery} placeholder="Ad, e-posta veya rol ara..." />
    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} onRowClick={open} emptyState={<ExactEmptyState icon={UsersRound} title="Panel kullanıcısı bulunamadı" />} />}
    <ExactDetailDrawer open={Boolean(selected && draft)} onClose={() => { if (!busy) { setSelected(null); setDraft(null); } }} title={draft ? nameOf(draft) : "Kullanıcı"} subtitle={draft?.email} width={620} footer={draft ? <div className="flex gap-2"><ExactButton variant="secondary" size="sm" className="flex-1" onClick={() => { setSelected(null); setDraft(null); }}>Kapat</ExactButton><ExactButton size="sm" className="flex-1" onClick={() => void save()} loading={busy === "save"}><Save className="h-4 w-4" /> Kaydet</ExactButton></div> : null}>
      {draft ? <div className="space-y-5"><div className="flex items-center gap-3"><ExactAvatar name={nameOf(draft)} size="lg" /><div><p className="ruth-type-card-title text-main">{nameOf(draft)}</p><p className="ruth-type-caption text-muted">{draft.email}</p></div></div><div className="grid sm:grid-cols-2 gap-3"><ExactField label="Ad soyad"><input value={draft.full_name || ""} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} className={exactFormInputClass} /></ExactField><ExactField label="Rol"><select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })} className={exactFormInputClass}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></ExactField></div><button type="button" onClick={() => void toggleActive()} className={`w-full flex items-center gap-3 p-3 radius-control border transition-all ${active(draft) ? "bg-success-soft border-success/20" : "bg-danger-soft border-danger/20"}`}><div className={`flex items-center justify-center h-9 w-9 radius-small ${active(draft) ? "bg-success/15 text-success-foreground" : "bg-danger/15 text-danger-foreground"}`}>{active(draft) ? <UserCheck className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}</div><div className="text-left"><p className="ruth-type-card-title text-main">{active(draft) ? "Erişim aktif" : "Erişim devre dışı"}</p><p className="ruth-type-caption text-muted">Tıklayarak panel erişimini değiştir.</p></div></button><div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label uppercase text-subtle">Rol açıklaması</p><p className="ruth-type-body mt-1 text-main">{draft.role === "owner" ? "Tüm sistem, kullanıcı, entegrasyon ve finans yetkileri." : draft.role === "admin" ? "Panel operasyonları ve ayarlar; sahip rolünü yönetemez." : draft.role === "operations" ? "Sipariş, üretim, stok, kargo ve iade operasyonları." : draft.role === "support" ? "Müşteri, CRM, sipariş görüntüleme ve destek işlemleri." : draft.role === "marketing" ? "Kampanya, e-posta, tema ve analitik araçları." : "Verileri görüntüler; değişiklik yapamaz."}</p></div></div> : null}
    </ExactDetailDrawer>
    <ExactFormModal open={inviteOpen} onClose={() => { if (!busy) setInviteOpen(false); }} title="Panel kullanıcısı davet et" subtitle="Kullanıcı e-posta bağlantısıyla hesabını oluşturur." size="md" footer={<><ExactButton variant="secondary" size="sm" onClick={() => setInviteOpen(false)}>Vazgeç</ExactButton><ExactButton size="sm" onClick={() => void invite()} loading={busy === "invite"}><Mail className="h-4 w-4" /> Davet gönder</ExactButton></>}><div className="space-y-3"><ExactField label="E-posta" required><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} className={exactFormInputClass} /></ExactField><ExactField label="Ad soyad"><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} className={exactFormInputClass} /></ExactField><ExactField label="Başlangıç rolü"><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as AdminRole)} className={exactFormInputClass}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></ExactField></div></ExactFormModal>
  </div>;
}
