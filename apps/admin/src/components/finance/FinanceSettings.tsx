"use client";
import { useState } from "react";
import {
  Drawer,
  PageSection,
  Button,
  Notice,
  InputControl as Input,
} from "@ruth-commerce/ui";
import {
  ActionForm,
  Pick,
  command,
  type Setup,
  type Row,
  Field,
  useFinance,
} from "./shared";
import { financeBankCsv } from "@ruth-commerce/commerce-core/finance";
export function FinanceSettings({
  setup,
  onClose,
  onSaved,
}: {
  setup: Setup;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState("settings"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const bank = useFinance<{ rows: Row[] }>("/api/finance/bank");
  const [bankAccount, setBankAccount] = useState("");
  const [recognition, setRecognition] = useState(setup.settings.recognition);
  const act = async (action: string, data: Row) => {
    await command(action, data);
    setMessage("Kaydedildi.");
    onSaved();
  };
  const categories = setup.categories.map(
      (r) => [r.id, r.name] as [string, string],
    ),
    accounts = setup.accounts.map((r) => [r.id, r.name] as [string, string]);
  return (
    <Drawer open title="Finans ayarları" onClose={onClose}>
      <div className="space-y-4">
        <Pick
          label="Bölüm"
          value={tab}
          onChange={setTab}
          options={[
            ["settings", "Hesaplama"],
            ["category", "Kategoriler"],
            ["account", "Kasa / Banka"],
            ["transfer", "Hesaplar arası transfer"],
            ["budget", "Bütçeler"],
            ["recurring", "Tekrarlayan giderler"],
            ["permission", "Yetkiler"],
            ["paytr", "PayTR kesintileri"],
            ["bank", "Banka CSV / Mutabakat"],
            ["history", "Geçmiş siparişler"],
          ]}
        />
        {message ? <Notice>{message}</Notice> : null}
        {tab === "settings" ? (
          <PageSection title="Hasılat tanıma">
            <Pick
              label="Satışı hangi aşamada gösterelim?"
              value={recognition}
              onChange={setRecognition}
              options={[
                ["paid", "Ödeme alındığında"],
                ["delivered", "Teslim edildiğinde"],
              ]}
            />
            <Notice>
              Sonuçlar kayıtlı giderlere göre tahminidir. Vergi ve amortisman
              tamamlanmadan kesin net dönem kârı gösterilmez. KDV hariç tutarlar
              raporlanır.
            </Notice>
            <Button onClick={() => void act("settings", { recognition })}>
              Kaydet
            </Button>
          </PageSection>
        ) : null}
        {tab === "category" ? (
          <ActionForm
            fields={[
              { key: "name", label: "Kategori adı" },
              {
                key: "parent_id",
                label: "Üst kategori",
                options: [["", "Ana kategori"], ...categories],
              },
            ]}
            onSubmit={(v) => act("category", v)}
          />
        ) : null}
        {tab === "account" ? (
          <>
            <Notice>
              Otomatik banka bağlantısı bulunmuyor. Bakiyeler kayıtlı
              hareketlerden hesaplanır.
            </Notice>
            <ActionForm
              fields={[
                { key: "name", label: "Hesap adı" },
                {
                  key: "kind",
                  label: "Tür",
                  options: [
                    ["bank", "Banka"],
                    ["cash", "Kasa"],
                    ["processor", "Ödeme kuruluşu"],
                  ],
                  value: "bank",
                },
                { key: "currency", label: "Para birimi", value: "TRY" },
                { key: "opening", label: "Açılış bakiyesi", value: "0" },
                {
                  key: "opening_date",
                  label: "Açılış tarihi",
                  type: "date",
                  value: new Date().toISOString().slice(0, 10),
                },
              ]}
              onSubmit={(v) => act("account", v)}
            />
          </>
        ) : null}
        {tab === "transfer" ? (
          <ActionForm
            fields={[
              {
                key: "account_id",
                label: "Çıkış hesabı",
                options: [["", "Seçiniz"], ...accounts],
              },
              {
                key: "to_account_id",
                label: "Giriş hesabı",
                options: [["", "Seçiniz"], ...accounts],
              },
              { key: "amount", label: "Tutar" },
              { key: "paid_on", label: "Tarih", type: "date" },
            ]}
            onSubmit={(v) =>
              act("transfer", { ...v, key: crypto.randomUUID() })
            }
          />
        ) : null}
        {tab === "budget" ? (
          <ActionForm
            fields={[
              {
                key: "category_id",
                label: "Kategori",
                options: [["", "Seçiniz"], ...categories],
              },
              { key: "month", label: "Ayın ilk günü", type: "date" },
              { key: "currency", label: "Para birimi", value: "TRY" },
              { key: "amount", label: "Aylık bütçe" },
            ]}
            onSubmit={(v) => act("budget", v)}
          />
        ) : null}
        {tab === "permission" ? (
          <ActionForm
            fields={[
              { key: "user_id", label: "Kullanıcı kimliği (Auth UUID)" },
              {
                key: "permission",
                label: "Yetki",
                options: [
                  ["view", "Görüntüle"],
                  ["expense_create", "Gider oluştur"],
                  ["expense_edit", "Gider / maliyet düzenle"],
                  ["income_create", "Gelir oluştur"],
                  ["pay", "Ödeme kaydet"],
                  ["export", "Dışa aktar"],
                  ["settings", "Finans ayarları"],
                  ["void", "İptal et"],
                ],
                value: "view",
              },
              {
                key: "granted",
                label: "Erişim",
                value: "true",
                options: [
                  ["true", "Yetki ver"],
                  ["false", "Yetkiyi kaldır"],
                ],
              },
            ]}
            onSubmit={(v) =>
              act("permission", { ...v, granted: v.granted === "true" })
            }
          />
        ) : null}
        {tab === "recurring" ? (
          <div className="space-y-3">
            {setup.recurring.length ? (
              setup.recurring.map((r) => (
                <PageSection
                  key={r.id}
                  title={r.template.title}
                  description={`${r.next_on} · ${r.active ? "Aktif" : "Duraklatıldı"}`}
                >
                  <Button
                    onClick={() =>
                      void act("recurring", { ...r, active: !r.active })
                    }
                  >
                    {r.active ? "Durdur" : "Başlat"}
                  </Button>
                </PageSection>
              ))
            ) : (
              <p>Gider eklerken tekrar sıklığını seçebilirsin.</p>
            )}
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await act("run", {});
                } catch (e) {
                  setMessage(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Vadesi gelenleri oluştur
            </Button>
          </div>
        ) : null}
        {tab === "paytr" ? (
          <>
            <Notice>
              Gerçek PayTR işlem kesintileri aktarılır. KDV dökümü ayrıca fatura
              ile doğrulanmalıdır. En fazla üç günlük aralık seç.
            </Notice>
            <ActionForm
              fields={[
                { key: "from", label: "Başlangıç", type: "date" },
                { key: "to", label: "Bitiş", type: "date" },
              ]}
              onSubmit={(v) => act("paytr_sync", v)}
              label="PayTR dökümünü aktar"
            />
          </>
        ) : null}
        {tab === "bank" ? (
          <div className="space-y-3">
            <Notice>
              CSV başlıkları: date;amount;reference;description. Tarih
              YYYY-AA-GG. İçe aktarma gelir/gider oluşturmaz; mevcut ödeme ile
              eşleştirilir ve mükerrer nakit hareketi önlenir.
            </Notice>
            <Pick
              label="Banka hesabı"
              value={bankAccount}
              onChange={setBankAccount}
              options={[["", "Seçiniz"], ...accounts]}
            />
            <Field label="CSV yükle">
              <Input
                type="file"
                accept=".csv,text/csv"
                disabled={!bankAccount || busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    await act("bank_import", {
                      account_id: bankAccount,
                      rows: financeBankCsv(await file.text()),
                    });
                    void bank.load();
                  } catch (e) {
                    setMessage(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </Field>
            {bank.data?.rows.map((r) => (
              <PageSection
                key={r.id}
                title={`${r.occurred_on} · ${r.amount} · ${r.reference}`}
                description={
                  r.payment_id ? "Eşleştirildi" : "Eşleştirme bekliyor"
                }
              >
                {!r.payment_id ? (
                  <ActionForm
                    fields={[
                      {
                        key: "payment_id",
                        label: "Mevcut finans ödeme kimliği (UUID)",
                      },
                    ]}
                    onSubmit={async (v) => {
                      await act("bank_match", { ...v, row_id: r.id });
                      void bank.load();
                    }}
                    label="Eşleştir"
                  />
                ) : null}
              </PageSection>
            ))}
          </div>
        ) : null}
        {tab === "history" ? (
          <>
            <Notice>
              Geçmiş siparişler tekrar oluşturulmadan içe alınır. Tarihî
              maliyeti bilinmeyen ürünler eksik olarak işaretlenir.
            </Notice>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  let cursor = null;
                  let count = 0;
                  do {
                    const r = await command("backfill", { cursor });
                    count += r.result.count;
                    cursor = r.result.cursor;
                    if (r.result.count < 200) break;
                  } while (cursor);
                  setMessage(`${count} sipariş işlendi.`);
                  onSaved();
                } catch (e) {
                  setMessage(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "İşleniyor…" : "Geçmiş siparişleri aktar"}
            </Button>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
