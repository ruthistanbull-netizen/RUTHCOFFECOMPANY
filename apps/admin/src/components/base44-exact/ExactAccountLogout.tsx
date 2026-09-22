"use client";

import { LogOut, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearAdminAuthPersistence, getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ExactButton, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";

export function ExactAccountLogout() {
  const router = useRouter();
  const toast = useExactToast();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      toast.error("Oturum bağlantısı hazırlanamadı.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;

      clearAdminAuthPersistence();
      try {
        window.localStorage.removeItem("ruth_admin_next_checked_until");
        window.sessionStorage.removeItem("ruth_admin_next_checked_until");
      } catch {}

      router.replace("/login");
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Çıkış yapılamadı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ExactDataCard title="Oturum Güvenliği" action={<ShieldCheck className="h-4 w-4 text-accent" />}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-main">Bu cihazdaki panel oturumunu kapat</p>
          <p className="mt-1 text-xs text-muted">Çıkış yapmadığın sürece bu cihazdaki panel oturumu açık kalır.</p>
        </div>
        <ExactButton
          type="button"
          variant="destructive"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => void logout()}
          loading={loading}
        >
          <LogOut className="h-4 w-4" /> Çıkış Yap
        </ExactButton>
      </div>
    </ExactDataCard>
  );
}
