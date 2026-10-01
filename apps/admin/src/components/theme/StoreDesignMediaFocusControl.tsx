"use client";

const presets = [
  ["50% 50%", "Orta"],
  ["50% 0%", "Üst"],
  ["50% 100%", "Alt"],
  ["0% 50%", "Sol"],
  ["100% 50%", "Sağ"],
] as const;

export function StoreDesignMediaFocusControl({ value = "50% 50%", onChange }: { value?: string; onChange: (value: string) => void }) {
  const coordinates = value.match(/^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  const x = coordinates ? Math.min(100, Math.max(0, Number(coordinates[1]))) : 50;
  const y = coordinates ? Math.min(100, Math.max(0, Number(coordinates[2]))) : 50;
  const custom = !presets.some(([position]) => position === value);
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-[10px] opacity-65">
        Odak noktası
        <select value={custom ? "custom" : value} onChange={(event) => { if (event.target.value !== "custom") onChange(event.target.value); }} className="sd-field h-9 rounded-md border px-2.5 text-[11px] font-medium outline-none">
          {presets.map(([position, label]) => <option key={position} value={position}>{label}</option>)}
          {custom ? <option value="custom">Özel konum</option> : null}
        </select>
      </label>
      <label className="grid gap-1 text-[10px] opacity-65">
        <span>Yatay odak · {Math.round(x)}%</span>
        <input aria-label="Yatay odak" type="range" min="0" max="100" step="1" value={x} onChange={(event) => onChange(`${event.target.value}% ${y}%`)} className="min-h-8 w-full accent-[#C94A40]" />
      </label>
      <label className="grid gap-1 text-[10px] opacity-65">
        <span>Dikey odak · {Math.round(y)}%</span>
        <input aria-label="Dikey odak" type="range" min="0" max="100" step="1" value={y} onChange={(event) => onChange(`${x}% ${event.target.value}%`)} className="min-h-8 w-full accent-[#C94A40]" />
      </label>
    </div>
  );
}
