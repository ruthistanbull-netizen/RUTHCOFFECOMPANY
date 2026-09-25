"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  adminRememberSessionEnabled,
  getSupabaseBrowser,
} from "@/lib/supabaseBrowser";
import { hasRuthWorkspaceAccess, prepareRRHubWorkspaceForDocument } from "@/lib/rrHubRuntime";

const RUTH_ADMIN_URL = (
  process.env.NEXT_PUBLIC_RUTH_ADMIN_URL || "https://ruthcommerce.zeabur.app"
).replace(/\/$/, "");

const RUTH_ENTERED_KEY = "rr_hub_ruth_entered_v1";
const ROSTA_ENTERED_KEY = "rosta_panel_hub_entered_v1";
const RUTH_ADMIN_ORIGIN = (() => {
  try {
    return new URL(RUTH_ADMIN_URL).origin;
  } catch {
    return "";
  }
})();

export function RuthWorkspaceShell() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const submittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHubMessage = (event: MessageEvent) => {
      if (RUTH_ADMIN_ORIGIN && event.origin !== RUTH_ADMIN_ORIGIN) return;
      if (event.data?.type !== "RR_HUB_RETURN") return;
      try {
        window.sessionStorage.removeItem(ROSTA_ENTERED_KEY);
        window.sessionStorage.removeItem(RUTH_ENTERED_KEY);
      } catch {}
      window.location.assign("/profiles");
    };
    window.addEventListener("message", onHubMessage);

    prepareRRHubWorkspaceForDocument();
    const entered = hasRuthWorkspaceAccess();

    if (!entered) {
      window.location.replace("/profiles");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session?.access_token) {
          throw sessionError || new Error("RR HUB oturumu bulunamadı.");
        }
        if (cancelled) return;

        const frame = frameRef.current;
        if (!frame) throw new Error("Ruth çalışma alanı hazırlanamadı.");

        const form = document.createElement("form");
        form.method = "POST";
        form.action = `${RUTH_ADMIN_URL}/api/panel-hub/sso`;
        form.target = frame.name;
        form.style.display = "none";

        const token = document.createElement("input");
        token.type = "hidden";
        token.name = "access_token";
        token.value = data.session.access_token;
        form.appendChild(token);

        const rememberField = document.createElement("input");
        rememberField.type = "hidden";
        rememberField.name = "remember";
        rememberField.value = adminRememberSessionEnabled() ? "1" : "0";
        form.appendChild(rememberField);

        document.body.appendChild(form);
        submittedRef.current = true;
        form.submit();
        window.setTimeout(() => form.remove(), 0);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Ruth çalışma alanı açılamadı.");
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("message", onHubMessage);
    };
  }, []);

  return (
    <main className="fixed inset-0 z-[2147483646] overflow-hidden bg-[#111111]" data-ruth-workspace-shell>
      {!ready ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111111] text-[#FBF3E6]">
          <div className="text-center">
            <LoaderCircle className="mx-auto h-7 w-7 animate-spin opacity-60" />
            <p className="mt-4 text-[13px] font-medium tracking-[-0.01em] opacity-72">
              Ruth Istanbul açılıyor
            </p>
            <p className="mt-1 text-[10px] opacity-32">RR HUB güvenli oturumu hazırlanıyor.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#111111] px-6 text-[#FBF3E6]">
          <div className="max-w-sm text-center">
            <p className="text-[17px] font-semibold">Ruth Istanbul açılamadı</p>
            <p className="mt-2 text-[12px] leading-5 opacity-55">{error}</p>
            <button
              type="button"
              onClick={() => window.location.replace("/profiles")}
              className="mt-6 h-10 rounded-md bg-[#FBF3E6] px-5 text-[12px] font-semibold text-[#111111]"
            >
              RR HUB'a dön
            </button>
          </div>
        </div>
      ) : null}

      <iframe
        ref={frameRef}
        name="rr-ruth-workspace"
        title="Ruth Istanbul"
        src="about:blank"
        onLoad={() => {
          if (!submittedRef.current) return;
          window.setTimeout(() => setReady(true), 220);
        }}
        allow="clipboard-read; clipboard-write; camera; microphone"
        className="absolute inset-0 h-full w-full border-0 bg-[#FBF3E6]"
        style={{
          width: "100%",
          height: "100dvh",
          minHeight: "100dvh",
          border: 0,
        }}
      />
    </main>
  );
}
