import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PANEL_ROLES = new Set(["owner", "admin", "operations", "support", "marketing", "viewer"]);
type AccountAction = "update_profile" | "update_user" | "invite_user" | "create_user" | "send_reset";

type ProfileRow = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AccountRow = {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  panel_role: string;
  status: "active" | "disabled";
  email_confirmed: boolean;
  last_sign_in_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_current: boolean;
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizedRole(value: unknown) {
  const role = clean(value, 40).toLowerCase();
  return PANEL_ROLES.has(role) ? role : "viewer";
}

function normalizedStatus(value: unknown): "active" | "disabled" {
  return clean(value, 30).toLowerCase() === "disabled" ? "disabled" : "active";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function displayName(profile: ProfileRow, user: any) {
  return clean(profile.full_name, 160)
    || clean(user?.user_metadata?.full_name, 160)
    || clean(user?.user_metadata?.name, 160)
    || clean(user?.email, 160).split("@")[0]
    || "Yönetici";
}

async function profiles(supabase: any): Promise<ProfileRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, auth_user_id, email, full_name, phone, role, created_at, updated_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ProfileRow[];
}

async function payload(auth: any) {
  const profileRows = await profiles(auth.supabase);
  const { data: authData, error: authError } = await auth.supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (authError) throw new Error(authError.message);
  const usersById = new Map((authData.users || []).map((user: any) => [String(user.id), user]));

  const accounts: AccountRow[] = profileRows.map((profile, index) => {
    const user: any = usersById.get(String(profile.auth_user_id || ""));
    const metadata = user?.user_metadata || {};
    return {
      id: String(profile.id),
      auth_user_id: profile.auth_user_id ? String(profile.auth_user_id) : null,
      full_name: displayName(profile, user),
      email: clean(user?.email || profile.email, 240),
      phone: clean(profile.phone, 80) || null,
      panel_role: normalizedRole(metadata.panel_role || (index === 0 ? "owner" : "admin")),
      status: normalizedStatus(metadata.panel_status),
      email_confirmed: Boolean(user?.email_confirmed_at || user?.confirmed_at),
      last_sign_in_at: user?.last_sign_in_at || null,
      created_at: profile.created_at || user?.created_at || null,
      updated_at: profile.updated_at || user?.updated_at || null,
      is_current: String(profile.id) === String(auth.profile.id),
    };
  });

  const current = accounts.find((account) => account.is_current) || {
    id: String(auth.profile.id),
    auth_user_id: String(auth.user.id),
    full_name: clean(auth.profile.full_name, 160) || clean(auth.user.user_metadata?.full_name, 160) || clean(auth.user.email, 160).split("@")[0] || "Yönetici",
    email: clean(auth.user.email, 240),
    phone: null,
    panel_role: normalizedRole(auth.user.user_metadata?.panel_role || "admin"),
    status: normalizedStatus(auth.user.user_metadata?.panel_status),
    email_confirmed: Boolean(auth.user.email_confirmed_at),
    last_sign_in_at: auth.user.last_sign_in_at || null,
    created_at: auth.user.created_at || null,
    updated_at: auth.user.updated_at || null,
    is_current: true,
  } satisfies AccountRow;

  return { current, accounts };
}

async function assertEmailAvailable(supabase: any, email: string, targetId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .neq("id", targetId)
    .limit(1);
  if (error) throw new Error(error.message);
  if ((data || []).length) throw new Error("Bu e-posta başka bir hesap tarafından kullanılıyor.");
}

async function updateAccountIdentity(options: {
  auth: any;
  target: ProfileRow;
  fullName: string;
  email: string;
  phone: string | null;
  password: string;
  panelRole?: string;
  status?: "active" | "disabled";
}) {
  const { auth, target, fullName, email, phone, password, panelRole, status } = options;
  if (!target.auth_user_id) throw new Error("Bu yönetici hesabının Auth kullanıcısı bağlı değil.");
  if (!validEmail(email)) throw new Error("Geçerli bir e-posta adresi gir.");
  if (password && password.length < 8) throw new Error("Yeni şifre en az 8 karakter olmalı.");

  await assertEmailAvailable(auth.supabase, email, String(target.id));

  const previous = {
    email: target.email,
    full_name: target.full_name,
    phone: target.phone,
  };

  const { data: userData, error: userReadError } = await auth.supabase.auth.admin.getUserById(String(target.auth_user_id));
  if (userReadError || !userData.user) throw new Error(userReadError?.message || "Auth kullanıcısı okunamadı.");

  const oldMetadata = userData.user.user_metadata || {};
  const profileUpdate = {
    email,
    full_name: fullName,
    phone,
    role: "admin",
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await auth.supabase.from("profiles").update(profileUpdate).eq("id", target.id);
  if (profileError) throw new Error(profileError.message);

  const authUpdate = {
    email,
    email_confirm: true,
    ...(phone ? { phone } : {}),
    ...(password ? { password } : {}),
    user_metadata: {
      ...oldMetadata,
      full_name: fullName,
      ...(panelRole ? { panel_role: panelRole } : {}),
      ...(status ? { panel_status: status } : {}),
    },
  };

  const result = await auth.supabase.auth.admin.updateUserById(String(target.auth_user_id), authUpdate as any);
  if (result.error) {
    await auth.supabase.from("profiles").update({
      email: previous.email,
      full_name: previous.full_name,
      phone: previous.phone,
      updated_at: new Date().toISOString(),
    }).eq("id", target.id);
    throw new Error(result.error.message);
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ ok: true, ...(await payload(auth)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Hesaplar alınamadı." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const action = (clean(body.action, 40) || "update_profile") as AccountAction;
  const targetId = clean(body.profile_id, 80) || String(auth.profile.id);
  const fullName = clean(body.full_name, 160);
  const email = clean(body.email, 240).toLowerCase();
  const phone = clean(body.phone, 80) || null;
  const password = clean(body.password, 160);

  try {
    const currentPayload = await payload(auth);
    const profileRows = await profiles(auth.supabase);
    const target = profileRows.find((profile) => String(profile.id) === targetId);
    if (!target) throw new Error("Yönetici hesabı bulunamadı.");
    if (!fullName) throw new Error("Hesap adı boş bırakılamaz.");
    if (!email) throw new Error("E-posta adresi boş bırakılamaz.");

    const isSelf = targetId === String(auth.profile.id);
    const currentRole = normalizedRole(currentPayload.current.panel_role);
    if (!isSelf && currentRole !== "owner") {
      throw new Error("Başka bir yönetici hesabını yalnızca hesap sahibi düzenleyebilir.");
    }

    if (action === "update_profile") {
      if (!isSelf) throw new Error("Profil güncellemesi yalnızca kendi hesabın için kullanılabilir.");
      await updateAccountIdentity({ auth, target, fullName, email, phone, password });
    } else if (action === "update_user") {
      if (isSelf) throw new Error("Kendi rolünü ve erişimini bu işlemle değiştiremezsin.");
      const status = normalizedStatus(body.status);
      const role = normalizedRole(body.panel_role);
      const activeOthers = currentPayload.accounts.filter((account: AccountRow) => account.id !== targetId && account.status === "active").length;
      if (status === "disabled" && activeOthers === 0) throw new Error("Son aktif yönetici hesabı devre dışı bırakılamaz.");
      await updateAccountIdentity({ auth, target, fullName, email, phone, password, panelRole: role, status });
    } else {
      throw new Error("Geçersiz hesap işlemi.");
    }

    return NextResponse.json({ ok: true, ...(await payload(auth)), credentials_changed: Boolean(password) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Hesap güncellenemedi." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 40) as AccountAction;
  const email = clean(body.email, 240).toLowerCase();
  const fullName = clean(body.full_name, 160);
  const phone = clean(body.phone, 80) || null;
  const authPhone = phone || undefined;
  const role = normalizedRole(body.panel_role);
  const password = clean(body.password, 160);
  const origin = new URL(request.url).origin;

  try {
    if (!email || !validEmail(email)) throw new Error("Geçerli bir e-posta adresi gir.");
    if (action === "send_reset") {
      const { error } = await auth.supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, sent: true });
    }

    const currentPayload = await payload(auth);
    if (normalizedRole(currentPayload.current.panel_role) !== "owner") {
      throw new Error("Yeni panel hesabını yalnızca hesap sahibi oluşturabilir.");
    }
    if (!fullName) throw new Error("Kullanıcı adı zorunlu.");

    let userId = "";
    if (action === "create_user") {
      if (password.length < 8) throw new Error("Geçici şifre en az 8 karakter olmalı.");
      const { data, error } = await auth.supabase.auth.admin.createUser({
        email,
        phone: authPhone,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, panel_role: role, panel_status: "active" },
      });
      if (error || !data.user) throw new Error(error?.message || "Kullanıcı oluşturulamadı.");
      userId = String(data.user.id);
    } else if (action === "invite_user") {
      const { data, error } = await auth.supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/reset-password`,
        data: { full_name: fullName, panel_role: role, panel_status: "active", phone: authPhone },
      });
      if (error || !data.user) throw new Error(error?.message || "Davet gönderilemedi.");
      userId = String(data.user.id);
    } else {
      throw new Error("Geçersiz kullanıcı oluşturma işlemi.");
    }

    const { error: profileError } = await auth.supabase.from("profiles").upsert({
      auth_user_id: userId,
      email,
      full_name: fullName,
      phone,
      role: "admin",
      updated_at: new Date().toISOString(),
    }, { onConflict: "email" });
    if (profileError) throw new Error(profileError.message);
    return NextResponse.json({ ok: true, ...(await payload(auth)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kullanıcı oluşturulamadı." }, { status: 400 });
  }
}
