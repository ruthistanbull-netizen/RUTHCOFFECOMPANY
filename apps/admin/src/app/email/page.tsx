import { EmailSettingsClient } from "@/components/EmailSettingsClient";

export default function EmailPage() {
  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">E-POSTA</p>
          <h1>Gmail Bağlantısı</h1>
          <p>ROSTA sipariş mailleri için kullanılacak Google hesabını bağla.</p>
        </div>
      </header>
      <EmailSettingsClient />
    </>
  );
}
