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
  const bank = useFinance<{ rows: Row[]; payments: Row[] }>("/api/finance/bank");
  const [bankAccount, setBankAccount] = useState("");
  const [paytrRates, setPaytrRates] = useState<Array<{rate:number;date:string;installments:number}>>([]);
  const [paytrTransactions, setPaytrTransactions] = useState<number | null>(null);
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
              onSubmit={async (v) => {
                const response = await command("paytr_sync", v);
                const result = response.result || {};
                setPaytrTransactions(Number(result.imported || 0));
                setPaytrRates(Array.isArray(result.rates) ? result.rates : []);
                setMessage("PayTR işlem raporu sorgulandı.");
                onSaved();
              }}
              label="PayTR dökümünü aktar"
            />
            {paytrTransactions !== null ? (
              <Notice>
                {paytrTransactions} işlem kaydı işlendi.
                {paytrRates.length === 0
                  ? " Seçilen tarihlerde işlem bazlı komisyon oranı bulunamadı."
                  : " PayTR'nin bildirdiği işlem oranları aşağıda."}
              </Notice>
            ) : null}
            {paytrRates.length ? (
              <div className="space-y-2 rounded-lg border border-border-subtle p-3">
                <strong className="text-sm">PayTR'nin bildirdiği komisyon oranları</strong>
                <p className="text-xs text-muted">Gerçek işlem bazlı oranlardır. Kart ve taksit sayısına göre değişebilir; tüm hesap için sabit oran değildir.</p>
                {paytrRates.map((r,index) => (
                  <div key={index} className="flex justify-between gap-3 text-sm">
                    <span>{r.date} · {r.installments > 1 ? `${r.installments} taksit` : "Tek çekim"}</span>
                    <strong>%{Number(r.rate).toLocaleString("tr-TR",{maximumFractionDigits:3})}</strong>
                  </div>
                ))}
              </div>
            ) : null}
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
                        label: "Eşleştirilecek ödeme",
                        options: [["", "Ödeme seç"],...(bank.data?.payments || []).map((p) =>
                          [String(p.id), `${p.paid_on} · ${p.direction === "in" ? "+" : "−"}${p.amount} · ${String(p.id).slice(0,8)}`] as [string,string]
                        )],
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

      </div>
    </Drawer>
  );
}
