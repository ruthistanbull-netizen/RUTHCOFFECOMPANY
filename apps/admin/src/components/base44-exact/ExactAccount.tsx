"use client";

import {
  BadgeCheck,
  Clock3,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  SaveLifecycleProvider,
  useSaveLifecycle,
  useSaveLifecycleSource,
} from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactField,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactEmptyState, ExactMetricCard } from "./data";

type PanelRole = "owner" | "admin" | "operations" | "support" | "marketing" | "viewer";
type Account = {
  id: string;
  auth_user_id?: string | null;
  full_name: string;
  email: string;
  phone?: string | null;
  panel_role: PanelRole;
  status: "active" | "disabled";
  email_confirmed: boolean;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_current?: boolean;
};
type AccountResponse = { current?: Account; accounts?: Account[]; credentials_changed?: boolean };
type CreateMode = "invite_user" | "create_user";
type CreateUserDraft = {
  full_name: string;
  email: string;
  phone: string;
  panel_role: PanelRole;
  password: string;
};
type ProfileSnapshot = {
  id: string;
  name: string;
  email: string;
  phone: string;
};
type TeamDraft = Account & {
  password: string;
  confirm_password: string;
};

const roleLabels: Record<PanelRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  operations: "Operasyon",
  support: "Müşteri Hizmetleri",
  marketing: "Pazarlama",
  viewer: "Görüntüleyici",
};

const emptyCreateDraft = (): CreateUserDraft => ({
  full_name: "",
  email: "",
  phone: "",
  panel_role: "operations",
  password: "",
});

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("tr-TR")).join("") || "R";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function ProfileEditor({
  current,
  onApplied,
}: {
  current: Account | null;
  onApplied: (result: AccountResponse) => void;
}) {
  const toast = useExactToast();
  const { save, saving } = useSaveLifecycle();
  const [savedProfile, setSavedProfile] = useState<ProfileSnapshot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const dirty = Boolean(savedProfile) && (
    name !== savedProfile?.name
    || email !== savedProfile?.email
    || phone !== savedProfile?.phone
    || password !== ""
    || confirmPassword !== ""
  );

  useEffect(() => {
    if (!current) {
      if (!dirty) {
        setSavedProfile(null);
        setName("");
        setEmail("");
        setPhone("");
        setPassword("");
        setConfirmPassword("");
      }
      return;
    }

    // A background refresh must never overwrite an unsaved draft for the same profile.
    if (savedProfile?.id === current.id && dirty) return;
    const next = {
      id: current.id,
      name: current.full_name || "",
      email: current.email || "",
      phone: current.phone || "",
    };
    setSavedProfile(next);
    setName(next.name);
    setEmail(next.email);
    setPhone(next.phone);
    setPassword("");
    setConfirmPassword("");
  }, [current, dirty, savedProfile?.id]);

  const validateProfile = useCallback(() => {
    if (!name.trim()) {
      toast.error("Hesap adı zorunlu.");
      return false;
    }
    if (!validEmail(email)) {
      toast.error("Geçerli bir e-posta adresi gir.");
      return false;
    }
    if (password && password.length < 8) {
      toast.error("Yeni şifre en az 8 karakter olmalı.");
      return false;
    }
    if (password !== confirmPassword) {
      toast.error("Yeni şifreler eşleşmiyor.");
      return false;
    }
    return true;
  }, [confirmPassword, email, name, password, toast]);

  const persistProfile = useCallback(async () => {
    if (!current) return true;
    try {
      const result = await adminRequest<AccountResponse>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({
          action: "update_profile",
          profile_id: current.id,
          full_name: name,
          email,
          phone,
          password,
        }),
      });
      onApplied(result);
      setSavedProfile({ id: current.id, name, email, phone });
      setPassword("");
      setConfirmPassword("");
      toast.success(result.credentials_changed ? "Hesap bilgilerin ve şifren güncellendi." : "Hesap bilgilerin güncellendi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Hesap güncellenemedi.");
      return false;
    }
  }, [current, email, name, onApplied, password, phone, toast]);

  const discardProfile = useCallback(() => {
    if (!savedProfile) return;
    setName(savedProfile.name);
    setEmail(savedProfile.email);
    setPhone(savedProfile.phone);
    setPassword("");
    setConfirmPassword("");
  }, [savedProfile]);

  useSaveLifecycleSource({
    id: "account-profile",
    dirty,
    validate: validateProfile,
    save: persistProfile,
    discard: discardProfile,
  });

  const sendReset = async () => {
    if (!current || resetBusy) return;
    setResetBusy(true);
    try {
      await adminRequest("/api/account", {
        method: "POST",
        body: JSON.stringify({ action: "send_reset", email: current.email }),
      });
      toast.success(`${current.email} adresine şifre yenileme bağlantısı gönderildi.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Şifre bağlantısı gönderilemedi.");
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <ExactDataCard title="Profil Bilgilerim" action={<UserRound className="h-4 w-4 text-accent" />}>
      <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-accent-soft p-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-base font-bold text-white">
          {initials(current?.full_name || "R")}
        </div>
        <div className="min-w-0">
          <p className="ruth-type-card-title truncate text-main">{current?.full_name || "Yönetici"}</p>
          <p className="ruth-type-code truncate text-muted">{current?.email || "—"}</p>
          <div className="mt-1 flex gap-1">
            <ExactStatusBadge status={current?.status || "active"} label={current?.status === "disabled" ? "Devre dışı" : "Aktif"} size="sm" />
            <ExactStatusBadge status="admin" label={current ? roleLabels[current.panel_role] : "Yönetici"} tone="accent" size="sm" />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ExactField label="Hesap adı" required>
          <input value={name} onChange={(event) => setName(event.target.value)} className={exactFormInputClass} />
        </ExactField>
        <ExactField label="E-posta" required>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={exactFormInputClass} />
        </ExactField>
        <ExactField label="Telefon">
          <input value={phone} onChange={(event) => setPhone(event.target.value)} className={exactFormInputClass} />
        </ExactField>
        <div className="grid gap-3 sm:grid-cols-2">
          <ExactField label="Yeni şifre">
            <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className={exactFormInputClass} placeholder="Değiştirmeyeceksen boş bırak" />
          </ExactField>
          <ExactField label="Yeni şifre tekrar">
            <input type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={exactFormInputClass} />
          </ExactField>
        </div>
        <div className="ruth-type-caption grid grid-cols-2 gap-2 text-muted">
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-2.5">
            <Clock3 className="mb-1 h-3.5 w-3.5 text-accent" />Son giriş<br />
            <strong className="ruth-type-code text-main">{dateTime(current?.last_sign_in_at)}</strong>
          </div>
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-2.5">
            <BadgeCheck className="mb-1 h-3.5 w-3.5 text-accent" />E-posta<br />
            <strong className="text-main">{current?.email_confirmed ? "Doğrulandı" : "Bekliyor"}</strong>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ExactButton variant="secondary" onClick={discardProfile} disabled={!dirty || saving}>
            Vazgeç
          </ExactButton>
          <ExactButton onClick={() => void save()} loading={saving} disabled={!dirty}>
            <Save className="h-4 w-4" /> Hesabımı Kaydet
          </ExactButton>
        </div>
        {current ? (
          <ExactButton className="w-full" variant="secondary" onClick={() => void sendReset()} loading={resetBusy} disabled={saving}>
            <KeyRound className="h-4 w-4" /> E-postayla Şifre Yenileme Gönder
          </ExactButton>
        ) : null}
      </div>
    </ExactDataCard>
  );
}

function CreateUserEditor({
  open,
  onClose,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  onApplied: (result: AccountResponse) => void;
}) {
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [createMode, setCreateMode] = useState<CreateMode>("invite_user");
  const [draft, setDraft] = useState<CreateUserDraft>(() => emptyCreateDraft());

  useEffect(() => {
    if (!open) return;
    setCreateMode("invite_user");
    setDraft(emptyCreateDraft());
  }, [open]);

  const dirty = open && (
    createMode !== "invite_user"
    || draft.full_name !== ""
    || draft.email !== ""
    || draft.phone !== ""
    || draft.panel_role !== "operations"
    || draft.password !== ""
  );

  const validateDraft = useCallback(() => {
    if (!draft.full_name.trim() || !validEmail(draft.email)) {
      toast.error("Ad soyad ve geçerli e-posta zorunlu.");
      return false;
    }
    if (createMode === "create_user" && draft.password.length < 8) {
      toast.error("Geçici şifre en az 8 karakter olmalı.");
      return false;
    }
    return true;
  }, [createMode, draft.email, draft.full_name, draft.password.length, toast]);

  const persistDraft = useCallback(async () => {
    try {
      const result = await adminRequest<AccountResponse>("/api/account", {
        method: "POST",
        body: JSON.stringify({ action: createMode, ...draft }),
      });
      onApplied(result);
      toast.success(createMode === "invite_user" ? "Kullanıcı daveti gönderildi." : "Yeni panel kullanıcısı oluşturuldu.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kullanıcı oluşturulamadı.");
      return false;
    }
  }, [createMode, draft, onApplied, toast]);

  const discardDraft = useCallback(() => {
    setCreateMode("invite_user");
    setDraft(emptyCreateDraft());
  }, []);

  useSaveLifecycleSource({
    id: "account-create-user",
    dirty,
    validate: validateDraft,
    save: persistDraft,
    discard: discardDraft,
  });

  const requestClose = () => {
    if (saving) return;
    void requestTransition(onClose);
  };

  const handleSave = async () => {
    const saved = await save();
    if (saved) onClose();
  };

  return (
    <ExactFormModal
      open={open}
      onClose={requestClose}
      title="Yeni Panel Kullanıcısı"
      subtitle="Davet gönder veya geçici şifreyle doğrudan hesap oluştur"
      size="md"
      footer={(
        <>
          <ExactButton variant="secondary" size="sm" onClick={requestClose} disabled={saving}>Vazgeç</ExactButton>
          <ExactButton size="sm" onClick={() => void handleSave()} loading={saving} disabled={!dirty}>
            <Plus className="h-4 w-4" /> {createMode === "invite_user" ? "Daveti Gönder" : "Hesabı Oluştur"}
          </ExactButton>
        </>
      )}
    >
      <div className="space-y-3">
        <ExactSegmentedControl
          value={createMode}
          onChange={(value) => setCreateMode(value as CreateMode)}
          options={[{ value: "invite_user", label: "E-posta Daveti" }, { value: "create_user", label: "Geçici Şifre" }]}
        />
        <ExactField label="Ad soyad" required>
          <input value={draft.full_name} onChange={(event) => setDraft((old) => ({ ...old, full_name: event.target.value }))} className={exactFormInputClass} />
        </ExactField>
        <ExactField label="E-posta" required>
          <input type="email" value={draft.email} onChange={(event) => setDraft((old) => ({ ...old, email: event.target.value }))} className={exactFormInputClass} />
        </ExactField>
        <ExactField label="Telefon">
          <input value={draft.phone} onChange={(event) => setDraft((old) => ({ ...old, phone: event.target.value }))} className={exactFormInputClass} />
        </ExactField>
        <ExactField label="Panel rolü">
          <select value={draft.panel_role} onChange={(event) => setDraft((old) => ({ ...old, panel_role: event.target.value as PanelRole }))} className={exactFormInputClass}>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </ExactField>
        {createMode === "create_user" ? (
          <ExactField label="Geçici şifre" required>
            <input type="password" minLength={8} value={draft.password} onChange={(event) => setDraft((old) => ({ ...old, password: event.target.value }))} className={exactFormInputClass} />
          </ExactField>
        ) : (
          <div className="ruth-type-caption rounded-[var(--radius-control)] bg-info-soft p-3 text-info-foreground">
            <Mail className="mb-1 h-4 w-4" />Kullanıcıya güvenli hesap kurulum bağlantısı gönderilir.
          </div>
        )}
      </div>
    </ExactFormModal>
  );
}

function UserEditor({
  account,
  canManage,
  onClose,
  onApplied,
}: {
  account: Account | null;
  canManage: boolean;
  onClose: () => void;
  onApplied: (result: AccountResponse) => void;
}) {
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    setDraft(account ? { ...account, password: "", confirm_password: "" } : null);
  }, [account?.id, account?.updated_at]);

  const dirty = Boolean(account && draft) && (
    draft?.full_name !== account?.full_name
    || draft?.email !== account?.email
    || (draft?.phone || "") !== (account?.phone || "")
    || draft?.panel_role !== account?.panel_role
    || draft?.status !== account?.status
    || draft?.password !== ""
    || draft?.confirm_password !== ""
  );

  const validateDraft = useCallback(() => {
    if (!draft?.full_name.trim()) {
      toast.error("Ad soyad zorunlu.");
      return false;
    }
    if (!validEmail(draft.email)) {
      toast.error("Geçerli bir e-posta adresi gir.");
      return false;
    }
    if (!canManage) {
      toast.error("Diğer yönetici hesaplarını yalnızca Sahip rolü düzenleyebilir.");
      return false;
    }
    if (draft.is_current) {
      toast.error("Kendi rolünü ve erişimini bu ekrandan değiştiremezsin.");
      return false;
    }
    if (draft.password && draft.password.length < 8) {
      toast.error("Yeni şifre en az 8 karakter olmalı.");
      return false;
    }
    if (draft.password !== draft.confirm_password) {
      toast.error("Yeni şifreler eşleşmiyor.");
      return false;
    }
    return true;
  }, [canManage, draft, toast]);

  const persistDraft = useCallback(async () => {
    if (!draft) return true;
    try {
      const result = await adminRequest<AccountResponse>("/api/account", {
        method: "PATCH",
        body: JSON.stringify({
          action: "update_user",
          profile_id: draft.id,
          full_name: draft.full_name,
          email: draft.email,
          phone: draft.phone || "",
          panel_role: draft.panel_role,
          status: draft.status,
          password: draft.password,
        }),
      });
      onApplied(result);
      toast.success(draft.password ? "Kullanıcı bilgileri ve şifresi güncellendi." : "Kullanıcı bilgileri güncellendi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kullanıcı güncellenemedi.");
      return false;
    }
  }, [draft, onApplied, toast]);

  const discardDraft = useCallback(() => {
    setDraft(account ? { ...account, password: "", confirm_password: "" } : null);
  }, [account]);

  useSaveLifecycleSource({
    id: "account-user-editor",
    dirty,
    validate: validateDraft,
    save: persistDraft,
    discard: discardDraft,
  });

  const requestClose = () => {
    if (saving) return;
    void requestTransition(onClose);
  };

  const handleSave = async () => {
    const saved = await save();
    if (saved) onClose();
  };

  const sendReset = async () => {
    if (!draft || resetBusy) return;
    setResetBusy(true);
    try {
      await adminRequest("/api/account", {
        method: "POST",
        body: JSON.stringify({ action: "send_reset", email: draft.email }),
      });
      toast.success(`${draft.email} adresine şifre yenileme bağlantısı gönderildi.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Şifre bağlantısı gönderilemedi.");
    } finally {
      setResetBusy(false);
    }
  };

  const disabled = !canManage || Boolean(draft?.is_current);

  return (
    <ExactFormModal
      open={Boolean(account)}
      onClose={requestClose}
      title={draft?.full_name || account?.full_name || "Kullanıcı"}
      subtitle={account?.email}
      size="md"
      footer={(
        <>
          <ExactButton variant="secondary" size="sm" onClick={requestClose} disabled={saving}>Kapat</ExactButton>
          <ExactButton size="sm" onClick={() => void handleSave()} loading={saving} disabled={!dirty || disabled}>
            <Save className="h-4 w-4" /> Değişiklikleri Kaydet
          </ExactButton>
        </>
      )}
    >
      {draft ? (
        <div className="space-y-3">
          {!canManage && !draft.is_current ? (
            <div className="ruth-type-caption rounded-[var(--radius-control)] bg-warning-soft p-3 text-warning-foreground">
              Diğer yönetici hesaplarını yalnızca Sahip rolü düzenleyebilir.
            </div>
          ) : null}
          <ExactField label="Ad soyad">
            <input value={draft.full_name} disabled={disabled} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="E-posta">
            <input type="email" value={draft.email} disabled={disabled} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="Telefon">
            <input value={draft.phone || ""} disabled={disabled} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={exactFormInputClass} />
          </ExactField>
          <ExactField label="Rol">
            <select value={draft.panel_role} disabled={disabled} onChange={(event) => setDraft({ ...draft, panel_role: event.target.value as PanelRole })} className={exactFormInputClass}>
              {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </ExactField>
          <ExactField label="Erişim">
            <select value={draft.status} disabled={disabled} onChange={(event) => setDraft({ ...draft, status: event.target.value as Account["status"] })} className={exactFormInputClass}>
              <option value="active">Aktif</option>
              <option value="disabled">Devre dışı</option>
            </select>
          </ExactField>
          <div className="grid gap-3 sm:grid-cols-2">
            <ExactField label="Yeni şifre">
              <input type="password" minLength={8} disabled={disabled} value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} className={exactFormInputClass} placeholder="İsteğe bağlı" />
            </ExactField>
            <ExactField label="Yeni şifre tekrar">
              <input type="password" minLength={8} disabled={disabled} value={draft.confirm_password} onChange={(event) => setDraft({ ...draft, confirm_password: event.target.value })} className={exactFormInputClass} />
            </ExactField>
          </div>
          <ExactButton variant="secondary" className="w-full" onClick={() => void sendReset()} loading={resetBusy} disabled={saving || (!canManage && !draft.is_current)}>
            <KeyRound className="h-4 w-4" /> Şifre Yenileme Gönder
          </ExactButton>
          {draft.is_current ? (
            <p className="ruth-type-caption text-warning-foreground">Kendi hesabını soldaki Profil Bilgilerim alanından düzenleyebilirsin.</p>
          ) : null}
        </div>
      ) : null}
    </ExactFormModal>
  );
}

export function ExactAccount() {
  const toast = useExactToast();
  const [current, setCurrent] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((result: AccountResponse) => {
    const nextCurrent = result.current || null;
    const nextAccounts = result.accounts || [];
    setCurrent(nextCurrent);
    setAccounts(nextAccounts);
    setSelected((old) => old && nextAccounts.some((item) => item.id === old.id)
      ? { ...nextAccounts.find((item) => item.id === old.id)! }
      : null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      apply(await adminRequest<AccountResponse>("/api/account", { hardRefresh: true }));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Hesap bilgileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [apply, toast]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => accounts.filter((item) => item.status === "active").length, [accounts]);
  const confirmedCount = useMemo(() => accounts.filter((item) => item.email_confirmed).length, [accounts]);
  const ownerCanManage = current?.panel_role === "owner";
  const listUnavailable = loading && !current && !accounts.length;

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="account">
      <ExactPageHeader
        title="Hesabım"
        subtitle="Profil, e-posta, şifre, ekip hesapları, roller ve erişim güvenliği"
        actions={(
          <>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} />
            {ownerCanManage ? (
              <ExactButton size="sm" onClick={() => setCreateOpen(true)} disabled={listUnavailable}><Plus className="h-4 w-4" /> Yeni Kullanıcı</ExactButton>
            ) : null}
          </>
        )}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExactMetricCard label="Panel Hesabı" value={accounts.length} icon={UsersRound} />
        <ExactMetricCard label="Aktif Kullanıcı" value={activeCount} icon={ShieldCheck} />
        <ExactMetricCard label="Doğrulanmış E-posta" value={confirmedCount} icon={BadgeCheck} />
        <ExactMetricCard
          label="Rol Seviyesi"
          value={current?.panel_role === "owner" ? 6 : current?.panel_role === "admin" ? 5 : current?.panel_role === "operations" ? 4 : current?.panel_role === "marketing" ? 3 : current?.panel_role === "support" ? 2 : 1}
          suffix={current ? ` · ${roleLabels[current.panel_role]}` : ""}
          icon={UserRound}
        />
      </div>

      {listUnavailable ? (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <ExactSkeleton className="h-[520px]" />
          <ExactSkeleton className="h-[520px]" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[380px_1fr]">
          <SaveLifecycleProvider>
            <ProfileEditor current={current} onApplied={apply} />
          </SaveLifecycleProvider>

          <ExactDataCard title="Panel Kullanıcıları" action={<span className="ruth-type-caption text-subtle">{activeCount} aktif</span>}>
            <div className="space-y-2">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setSelected({ ...account })}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-control)] bg-surface-secondary p-3 text-left transition-all hover:bg-accent-soft"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-primary text-xs font-bold text-accent shadow-sm">
                    {initials(account.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="ruth-type-card-title truncate text-main">{account.full_name}</p>
                      {account.is_current ? <span className="ruth-type-caption rounded-full bg-accent px-2 py-0.5 font-semibold text-white">Sen</span> : null}
                    </div>
                    <p className="ruth-type-code truncate text-muted">{account.email}</p>
                    <p className="ruth-type-caption mt-1 text-subtle">Son giriş: {dateTime(account.last_sign_in_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ExactStatusBadge status={account.status} label={account.status === "active" ? "Aktif" : "Kapalı"} size="sm" />
                    <span className="ruth-type-caption font-medium text-muted">{roleLabels[account.panel_role]}</span>
                  </div>
                </button>
              ))}
              {!accounts.length ? <ExactEmptyState compact icon={UsersRound} title="Panel kullanıcısı yok" /> : null}
            </div>
          </ExactDataCard>
        </div>
      )}

      <SaveLifecycleProvider>
        <CreateUserEditor open={createOpen} onClose={() => setCreateOpen(false)} onApplied={apply} />
      </SaveLifecycleProvider>

      <SaveLifecycleProvider>
        <UserEditor account={selected} canManage={Boolean(ownerCanManage)} onClose={() => setSelected(null)} onApplied={apply} />
      </SaveLifecycleProvider>
    </div>
  );
}
