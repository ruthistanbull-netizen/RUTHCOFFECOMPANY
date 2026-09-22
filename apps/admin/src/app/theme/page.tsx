import { ThemeClient } from "@/components/ThemeClient";

export default function ThemePage() {
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">MAĞAZA TASARIMI</p>
          <h1>Storefront</h1>
          <p>ROSTA renk ve tipografi sistemi sabit kalır; içerik ve medya ayarları aynı storefront tema kayıtlarına bağlıdır.</p>
        </div>
      </header>
      <ThemeClient />
    </>
  );
}
