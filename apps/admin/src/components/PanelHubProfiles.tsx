"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import {
  adminRememberSessionEnabled,
  getSupabaseBrowser,
  setAdminRememberSession,
} from "@/lib/supabaseBrowser";

const RUTH_ADMIN_URL = (
  process.env.NEXT_PUBLIC_RUTH_ADMIN_URL || "https://ruthcommerce.zeabur.app"
).replace(/\/$/, "");
const ROSTA_ENTERED_KEY = "rosta_panel_hub_entered_v1";
const RUTH_ENTERED_KEY = "rr_hub_ruth_entered_v1";
const PROFILE_NAME_KEY = "rr_hub_profile_name";

type PanelKey = "rosta" | "ruth";

export function PanelHubProfiles() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [active, setActive] = useState<PanelKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    const resetSelection = () => {
      setActive(null);
      setError(null);
      document.documentElement.style.removeProperty("pointer-events");
      try {
        window.sessionStorage.removeItem(ROSTA_ENTERED_KEY);
        window.sessionStorage.removeItem(RUTH_ENTERED_KEY);
      } catch {}
    };

    const onPageShow = () => resetSelection();
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetSelection();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    resetSelection();

    const remembered = adminRememberSessionEnabled();
    setRemember(remembered);

    try {
      const primary = remembered ? window.localStorage : window.sessionStorage;
      const secondary = remembered ? window.sessionStorage : window.localStorage;
      setFullName(primary.getItem(PROFILE_NAME_KEY) || secondary.getItem(PROFILE_NAME_KEY) || "");
    } catch {}

    let alive = true;
    void getSupabaseBrowser().auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (!data.session) {
        window.location.replace("/login");
        return;
      }

      setEmail(data.session.user.email || "");

      try {
        const response = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!alive) return;

        const profileName = String(result?.profile?.full_name || "").trim();
        if (profileName) {
          setFullName(profileName);
          try {
            const target = remembered ? window.localStorage : window.sessionStorage;
            const other = remembered ? window.sessionStorage : window.localStorage;
            target.setItem(PROFILE_NAME_KEY, profileName);
            other.removeItem(PROFILE_NAME_KEY);
          } catch {}
        }
      } catch {}
    });

    return () => {
      alive = false;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const enterRosta = () => {
    if (active) return;
    setError(null);
    setActive("rosta");
    try {
      window.sessionStorage.setItem(ROSTA_ENTERED_KEY, "1");
    } catch {}
    window.setTimeout(() => {
      window.location.assign("/dashboard");
    }, 720);
  };

  const enterRuth = () => {
    if (active) return;
    setError(null);
    setActive("ruth");
    try {
      window.sessionStorage.setItem(RUTH_ENTERED_KEY, "1");
    } catch {}
    window.setTimeout(() => {
      window.location.assign("/ruth");
    }, 330);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
    } finally {
      setAdminRememberSession(false);
      try {
        window.sessionStorage.removeItem(ROSTA_ENTERED_KEY);
        window.sessionStorage.removeItem(RUTH_ENTERED_KEY);
        window.sessionStorage.removeItem(PROFILE_NAME_KEY);
        window.localStorage.removeItem(PROFILE_NAME_KEY);
      } catch {}
      window.location.replace("/login");
    }
  };

  const cards = [
    {
      key: "rosta" as const,
      label: "ROSTA Coffee Co.",
      caption: "Yönetim Alanı",
      image: "/rosta-coffee-co.svg",
      imageClass: "h-[62%] w-[78%] object-contain",
      surface: "bg-[#F4F0E8]",
      action: enterRosta,
    },
    {
      key: "ruth" as const,
      label: "Ruth Istanbul",
      caption: "Yönetim Alanı",
      image: `${RUTH_ADMIN_URL}/ruth-commerce-user-logo.svg`,
      imageClass: "h-[72%] w-[84%] object-contain",
      surface: "bg-[#F4F0E8]",
      action: enterRuth,
    },
  ];

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#141414] text-white" data-panel-hub>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,255,255,.075),transparent_37%),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.32))]" />

      <header className="relative z-20 flex h-[68px] items-center justify-between px-5 pt-[env(safe-area-inset-top)] sm:h-[72px] sm:px-8 lg:px-12">
        <img
          src="/rr-hub-cream.svg"
          alt="RR HUB"
          draggable={false}
          className="h-[27px] w-auto select-none object-contain sm:h-[30px]"
        />
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="group inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-[12px] font-medium text-white/55 transition hover:bg-white/[0.055] hover:text-white active:scale-[0.97] disabled:opacity-40"
        >
          <LogOut className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {signingOut ? "Çıkılıyor…" : "Oturumu kapat"}
        </button>
      </header>

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 0.82 : 1 }}
        transition={{ duration: 0.24 }}
        className="relative z-10 mx-auto flex min-h-[calc(100dvh-132px)] w-full max-w-[1120px] flex-col items-center justify-center px-5 pb-[max(3rem,env(safe-area-inset-bottom))] pt-4 sm:min-h-[calc(100dvh-144px)] sm:pb-16 sm:pt-5"
      >
        <motion.div
          animate={active ? { opacity: 0.28, y: -8, scale: 0.985 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
          className="mb-8 max-w-[720px] text-center sm:mb-12"
        >
          <p className="mb-3 text-[13px] font-medium tracking-[-0.015em] text-white/48 sm:mb-4 sm:text-[15px]">
            Hoş geldiniz{fullName ? `, ${fullName}` : ""}
          </p>
          <h1 className="text-[30px] font-normal leading-[1.08] tracking-[-0.045em] text-white/94 sm:text-[45px] lg:text-[53px]">
            Hangi markayla devam etmek istiyorsunuz?
          </h1>
          <p className="mt-3 text-[10px] text-white/22 sm:text-[11px]">
            {email || "Yönetici hesabı"}
          </p>
        </motion.div>

        <div className="flex w-full max-w-[620px] items-start justify-center gap-5 sm:gap-11">
          {cards.map((card) => {
            const selected = active === card.key;
            const dimmed = Boolean(active && !selected);

            return (
              <motion.button
                key={card.key}
                type="button"
                onClick={card.action}
                disabled={Boolean(active)}
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={
                  selected
                    ? { opacity: 1, y: 0, scale: 1.12 }
                    : dimmed
                      ? { opacity: 0.15, y: 7, scale: 0.89 }
                      : { opacity: 1, y: 0, scale: 1, filter: "brightness(1)" }
                }
                transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.78 }}
                whileHover={active ? undefined : { scale: 1.055, y: -2 }}
                whileTap={active ? undefined : { scale: 0.925, y: 1, filter: "brightness(.76)" }}
                onPointerUp={(event) => event.currentTarget.blur()}
                onPointerCancel={(event) => event.currentTarget.blur()}
                onContextMenu={(event) => event.preventDefault()}
                className="group w-[140px] touch-manipulation select-none text-left outline-none [-webkit-tap-highlight-color:transparent] sm:w-[188px] lg:w-[208px]"
              >
                <div
                  className={[
                    "relative aspect-square w-full overflow-hidden rounded-[4px] border-[3px] border-transparent shadow-[0_18px_45px_rgba(0,0,0,.24)] transition-[border-color,filter,box-shadow,outline-color,outline-offset] duration-200",
                    "group-hover:border-black group-hover:outline group-hover:outline-2 group-hover:outline-black/70 group-hover:outline-offset-[3px] group-focus-visible:border-black group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-black group-focus-visible:outline-offset-[3px]",
                    selected ? "border-[5px] border-black outline outline-[3px] outline-[#6f665a] outline-offset-[4px] shadow-[0_26px_76px_rgba(0,0,0,.58),inset_0_0_0_1px_rgba(255,255,255,.16)]" : "",
                    card.surface,
                  ].join(" ")}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src={card.image}
                      alt={card.label}
                      draggable={false}
                      className={`${card.imageClass} pointer-events-none select-none transition-transform duration-200 group-hover:scale-[1.035]`}
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.06),transparent_38%,rgba(0,0,0,.08))]" />
                </div>

                <div className="pt-3 text-center sm:pt-4">
                  <p className="truncate text-[14px] font-normal text-[#808080] transition-colors duration-200 group-hover:text-white group-focus-visible:text-white sm:text-[18px]">
                    {card.label}
                  </p>
                  <p className="mt-1 text-[8px] font-medium uppercase tracking-[0.16em] text-white/24 sm:text-[9px]">
                    {card.caption}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mt-9 max-w-md rounded-md border border-red-400/20 bg-red-500/10 px-4 py-3 text-center text-[12px] text-red-100/85"
            >
              {error}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="mt-10 text-center text-[10px] tracking-[0.02em] text-white/20 sm:mt-12">
          {remember ? "Oturum bu cihazda açık tutuluyor." : "Bu oturum tarayıcı kapatıldığında sona erebilir."}
        </p>
      </motion.section>

      <AnimatePresence>
        {active ? (
          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-[#141414] px-6 text-[#F4F0E8]"
            aria-live="polite"
            aria-busy="true"
          >
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-center"
            >
              <LoaderCircle className="mx-auto h-7 w-7 animate-spin opacity-60" />
              <p className="mt-4 text-[13px] font-medium tracking-[-0.01em] opacity-72">
                {active === "rosta" ? "ROSTA Coffee Co. açılıyor" : "Ruth Istanbul açılıyor"}
              </p>
              <p className="mt-1 text-[10px] opacity-32">RR HUB güvenli oturumu hazırlanıyor.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
