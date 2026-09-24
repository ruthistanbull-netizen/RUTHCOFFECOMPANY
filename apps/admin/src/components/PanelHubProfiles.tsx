"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LogOut } from "lucide-react";
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

type PanelKey = "rosta" | "ruth";

function submitRuthSso(accessToken: string, remember: boolean) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${RUTH_ADMIN_URL}/api/panel-hub/sso`;
  form.style.display = "none";

  const token = document.createElement("input");
  token.type = "hidden";
  token.name = "access_token";
  token.value = accessToken;
  form.appendChild(token);

  const rememberField = document.createElement("input");
  rememberField.type = "hidden";
  rememberField.name = "remember";
  rememberField.value = remember ? "1" : "0";
  form.appendChild(rememberField);

  document.body.appendChild(form);
  form.submit();
}

export function PanelHubProfiles() {
  const [email, setEmail] = useState("");
  const [active, setActive] = useState<PanelKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    setRemember(adminRememberSessionEnabled());
    let alive = true;
    void getSupabaseBrowser().auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!data.session) {
        window.location.replace("/login");
        return;
      }
      setEmail(data.session.user.email || "");
    });
    return () => {
      alive = false;
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
    }, 360);
  };

  const enterRuth = async () => {
    if (active) return;
    setError(null);
    setActive("ruth");

    try {
      const supabase = getSupabaseBrowser();
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session?.access_token) {
        throw sessionError || new Error("Oturum bulunamadı.");
      }

      window.setTimeout(() => {
        submitRuthSso(data.session!.access_token, remember);
      }, 360);
    } catch (caught) {
      setActive(null);
      setError(caught instanceof Error ? caught.message : "Ruth paneline güvenli geçiş başlatılamadı.");
    }
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
      } catch {}
      window.location.replace("/login");
    }
  };

  const cards = [
    {
      key: "rosta" as const,
      label: "ROSTA Coffee Co.",
      caption: "Control Room",
      image: "/rosta-coffee-co.svg",
      imageClass: "h-[62%] w-[78%] object-contain",
      surface: "bg-[#F4F0E8]",
      action: enterRosta,
    },
    {
      key: "ruth" as const,
      label: "Ruth Istanbul",
      caption: "Commerce",
      image: `${RUTH_ADMIN_URL}/ruth-commerce-panel-logo.png?v=20260807-3`,
      imageClass: "h-[72%] w-[84%] object-contain",
      surface: "bg-[linear-gradient(145deg,#171717,#28231a)]",
      action: enterRuth,
    },
  ];

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#141414] text-white" data-panel-hub>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(255,255,255,.075),transparent_37%),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.32))]" />

      <header className="relative z-20 flex h-[72px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <div className="text-[17px] font-semibold tracking-[-0.03em] text-white/92">
          Control Hub
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="group inline-flex h-9 items-center gap-2 rounded-md px-2.5 text-[12px] font-medium text-white/55 transition hover:bg-white/[0.055] hover:text-white disabled:opacity-40"
        >
          <LogOut className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {signingOut ? "Çıkılıyor…" : "Oturumu kapat"}
        </button>
      </header>

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: active ? 0.82 : 1 }}
        transition={{ duration: 0.28 }}
        className="relative z-10 mx-auto flex min-h-[calc(100dvh-144px)] w-full max-w-[1120px] flex-col items-center justify-center px-5 pb-16 pt-5"
      >
        <motion.div
          animate={active ? { opacity: 0.28, y: -8, scale: 0.985 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          className="mb-10 text-center sm:mb-12"
        >
          <h1 className="text-[34px] font-normal leading-none tracking-[-0.045em] sm:text-[48px] lg:text-[56px]">
            Hangi panel?
          </h1>
          <p className="mt-3 text-[12px] text-white/38 sm:text-[13px]">
            {email || "Yönetici hesabı"}
          </p>
        </motion.div>

        <div className="flex w-full max-w-[620px] items-start justify-center gap-7 sm:gap-11">
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
                    ? { opacity: 1, y: 0, scale: 1.14 }
                    : dimmed
                      ? { opacity: 0.16, y: 8, scale: 0.88 }
                      : { opacity: 1, y: 0, scale: 1 }
                }
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                whileHover={active ? undefined : { scale: 1.07, y: -3 }}
                whileTap={active ? undefined : { scale: 0.985 }}
                className="group w-[132px] text-left outline-none sm:w-[188px] lg:w-[208px]"
              >
                <div
                  className={[
                    "relative aspect-square w-full overflow-hidden rounded-[4px] border-[3px] border-transparent shadow-[0_18px_45px_rgba(0,0,0,.24)] transition-[border-color,filter,box-shadow] duration-200",
                    "group-hover:border-white group-focus-visible:border-white",
                    selected ? "border-white shadow-[0_24px_70px_rgba(0,0,0,.5)]" : "",
                    card.surface,
                  ].join(" ")}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <img
                      src={card.image}
                      alt={card.label}
                      draggable={false}
                      className={`${card.imageClass} select-none transition-transform duration-300 group-hover:scale-[1.035]`}
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.06),transparent_38%,rgba(0,0,0,.08))]" />
                </div>

                <div className="pt-3 text-center sm:pt-4">
                  <p className="truncate text-[14px] font-normal text-[#808080] transition-colors duration-200 group-hover:text-white group-focus-visible:text-white sm:text-[18px]">
                    {card.label}
                  </p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/24 sm:text-[10px]">
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
    </main>
  );
}
