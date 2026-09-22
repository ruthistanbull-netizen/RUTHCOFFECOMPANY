"use client";

import { Check, Monitor, Moon, PanelLeft, RotateCcw, Sparkles, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { ExactButton, ExactPageHeader, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";

type ThemeMode = "light" | "dark" | "system";
type Density = "comfortable" | "compact";

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  window.localStorage.setItem("ruth_exact_theme_mode", mode);
  window.localStorage.setItem("ruth_exact_dark", dark ? "1" : "0");
}

export function ExactAppearance() {
  const toast = useExactToast();
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [density, setDensity] = useState<Density>("comfortable");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const savedTheme = (window.localStorage.getItem("ruth_exact_theme_mode") || "system") as ThemeMode;
    const savedDensity = (window.localStorage.getItem("ruth_exact_density") || "comfortable") as Density;
    const savedMotion = window.localStorage.getItem("ruth_exact_reduced_motion") === "1";
    setTheme(savedTheme);
    setDensity(savedDensity);
    setReducedMotion(savedMotion);
    applyTheme(savedTheme);
    document.documentElement.dataset.density = savedDensity;
    document.documentElement.classList.toggle("reduce-motion", savedMotion);
  }, []);

  const chooseTheme = (mode: ThemeMode) => {
    setTheme(mode);
    applyTheme(mode);
    toast.success("Görünüm teması güncellendi.");
  };

  const chooseDensity = (value: Density) => {
    setDensity(value);
    window.localStorage.setItem("ruth_exact_density", value);
    document.documentElement.dataset.density = value;
    toast.success("Panel yoğunluğu güncellendi.");
  };

  const toggleMotion = () => {
    const next = !reducedMotion;
    setReducedMotion(next);
    window.localStorage.setItem("ruth_exact_reduced_motion", next ? "1" : "0");
    document.documentElement.classList.toggle("reduce-motion", next);
  };

  const reset = () => {
    setTheme("system");
    setDensity("comfortable");
    setReducedMotion(false);
    window.localStorage.removeItem("ruth_exact_sidebar_collapsed");
    window.localStorage.removeItem("ruth_exact_density");
    window.localStorage.removeItem("ruth_exact_reduced_motion");
    applyTheme("system");
    document.documentElement.dataset.density = "comfortable";
    document.documentElement.classList.remove("reduce-motion");
    toast.success("Görünüm varsayılan ayarlara döndürüldü.");
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="appearance">
      <ExactPageHeader title="Görünüm" subtitle="Panel temasını, yoğunluğunu ve hareket tercihlerini yönet" actions={<ExactButton variant="secondary" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> Varsayılana dön</ExactButton>} />

      <ExactDataCard title="Tema">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { value: "light" as ThemeMode, label: "Açık", description: "Aydınlık çalışma alanı", icon: Sun },
            { value: "dark" as ThemeMode, label: "Koyu", description: "Düşük ışık için koyu tema", icon: Moon },
            { value: "system" as ThemeMode, label: "Sistem", description: "Cihaz temasını takip eder", icon: Monitor },
          ].map((item) => {
            const Icon = item.icon;
            const active = theme === item.value;
            return <button key={item.value} type="button" onClick={() => chooseTheme(item.value)} className={`relative rounded-[var(--radius-card)] border p-4 text-left transition-all ${active ? "border-accent bg-accent-soft shadow-card" : "border-border-subtle bg-surface-secondary hover:border-border-strong"}`}><div className="flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center radius-small ${active ? "bg-accent text-white" : "bg-surface-primary text-muted"}`}><Icon className="h-5 w-5" /></div><div><p className="ruth-type-card-title text-main">{item.label}</p><p className="ruth-type-caption mt-0.5 text-muted">{item.description}</p></div></div>{active ? <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white"><Check className="h-3 w-3" /></span> : null}</button>;
          })}
        </div>
      </ExactDataCard>

      <ExactDataCard title="Panel Yoğunluğu">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { value: "comfortable" as Density, label: "Rahat", description: "Kartlar ve listelerde daha geniş boşluklar" },
            { value: "compact" as Density, label: "Kompakt", description: "Aynı ekranda daha fazla satır ve işlem" },
          ].map((item) => <button key={item.value} type="button" onClick={() => chooseDensity(item.value)} className={`flex items-center gap-3 rounded-[var(--radius-card)] border p-4 text-left transition-all ${density === item.value ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-secondary"}`}><div className={`flex h-10 w-10 items-center justify-center radius-small ${density === item.value ? "bg-accent text-white" : "bg-surface-primary text-muted"}`}><PanelLeft className="h-5 w-5" /></div><div><p className="ruth-type-card-title text-main">{item.label}</p><p className="ruth-type-caption mt-0.5 text-muted">{item.description}</p></div>{density === item.value ? <Check className="ml-auto h-4 w-4 text-accent" /> : null}</button>)}
        </div>
      </ExactDataCard>

      <ExactDataCard title="Animasyonlar">
        <button type="button" onClick={toggleMotion} className="flex w-full items-center gap-3 rounded-[var(--radius-control)] bg-surface-secondary p-4 text-left">
          <div className={`flex h-10 w-10 items-center justify-center radius-small ${reducedMotion ? "bg-warning-soft text-warning-foreground" : "bg-accent-soft text-accent"}`}><Sparkles className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="ruth-type-card-title text-main">Hareketi azalt</p><p className="ruth-type-caption mt-0.5 text-muted">Açıldığında geçiş ve hareket animasyonları minimuma iner.</p></div>
          <span className={`relative h-6 w-10 rounded-full transition-colors ${reducedMotion ? "bg-accent" : "bg-surface-tertiary"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${reducedMotion ? "translate-x-4" : ""}`} /></span>
        </button>
      </ExactDataCard>
    </div>
  );
}
