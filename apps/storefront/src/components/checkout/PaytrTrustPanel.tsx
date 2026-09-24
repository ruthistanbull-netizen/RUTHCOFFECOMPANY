import { LockKeyhole, ShieldCheck } from "lucide-react";

export function PaytrTrustPanel() {
  return (
    <aside className="mx-auto -mt-16 mb-20 w-[calc(100%-2rem)] max-w-7xl rounded-2xl border border-kraft/35 bg-carbon-soft px-5 py-5 shadow-sm md:px-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--ruth-color-info) 10%, transparent)", color: "var(--ruth-color-info)" }}>
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cream/70">Güvenli ödeme altyapısı</p>
            <p className="mt-1 text-sm leading-6 text-cream">
              Kart bilgileriniz ROSTA sunucularına kaydedilmez; ödeme formu doğrudan PayTR sistemine gönderilir.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs text-cream/70">
            <LockKeyhole size={16} aria-hidden="true" />
            <span>3D Secure zorunlu</span>
          </div>
          <img
            src="/paytr/paytr-logo-color.svg"
            alt="PayTR ödeme altyapısı"
            width={156}
            height={27}
            className="h-auto w-[132px] sm:w-[156px]"
          />
        </div>
      </div>
    </aside>
  );
}
