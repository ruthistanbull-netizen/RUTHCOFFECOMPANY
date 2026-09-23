import * as React from "react";
import type { Money, MoneyBreakdown, PaymentSummary } from "@ruth-commerce/contracts";

export interface MoneySummaryProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  breakdown: MoneyBreakdown;
  paymentSummary?: PaymentSummary | null;
  title?: React.ReactNode;
  locale?: string;
  showZeroValues?: boolean;
  showCalculationId?: boolean;
}

type SummaryRow = {
  key: string;
  label: string;
  description?: string;
  value: React.ReactNode;
  negative?: boolean;
};

function formatMoney(value: Money, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.amountMinor / 100);
}

function installmentPlanText(summary: PaymentSummary, locale: string) {
  if (summary.installmentCount === 0) return "Tek çekim";
  const regular = formatMoney(summary.regularInstallmentAmount, locale);
  const final = formatMoney(summary.finalInstallmentAmount, locale);
  if (summary.regularInstallmentAmount.amountMinor === summary.finalInstallmentAmount.amountMinor) {
    return `${summary.installmentCount} × ${regular}`;
  }
  return `${summary.installmentCount - 1} × ${regular} + son taksit ${final}`;
}

function fallbackText(summary: PaymentSummary) {
  switch (summary.fallbackReason) {
    case "missing_payment_intent":
      return "Payment Intent bulunamadığı için eski sipariş tutarı güvenli fallback olarak gösteriliyor.";
    case "missing_quote_metadata":
      return "Ödeme kaydı var; ancak taksit quote metadatası eksik olduğu için mevcut tahsilat tutarı gösteriliyor.";
    case "legacy_order":
      return "Commerce V2 öncesi sipariş; taksit ve vade farkı bilgisi bulunmuyor.";
    default:
      return null;
  }
}

function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return (
    <dl className="ruth-money-summary__lines">
      {rows.map((row) => (
        <div key={row.key} className="ruth-money-summary__line">
          <dt>
            <span>{row.label}</span>
            {row.description ? <small>{row.description}</small> : null}
          </dt>
          <dd className={row.negative ? "is-negative" : undefined}>
            {row.negative ? "−" : ""}{row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MoneySummary({
  breakdown,
  paymentSummary,
  title = "Tutar Özeti",
  locale = "tr-TR",
  showZeroValues = false,
  showCalculationId = false,
  className = "",
  ...props
}: MoneySummaryProps) {
  const orderRows: SummaryRow[] = [
    {
      key: "subtotal",
      label: "Ürün toplamı",
      description: "Siparişteki ürünlerin toplamı",
      value: formatMoney(breakdown.subtotal, locale),
    },
    ...(showZeroValues || breakdown.discount.amountMinor > 0 ? [{
      key: "discount",
      label: "İndirim",
      description: "Kampanya ve kupon indirimi",
      value: formatMoney(breakdown.discount, locale),
      negative: true,
    }] : []),
    ...(showZeroValues || breakdown.pointsDiscount.amountMinor > 0 ? [{
      key: "points",
      label: "ROSTA Points",
      description: "Puan ile karşılanan tutar",
      value: formatMoney(breakdown.pointsDiscount, locale),
      negative: true,
    }] : []),
    ...(showZeroValues || breakdown.shipping.amountMinor > 0 ? [{
      key: "shipping",
      label: "Kargo",
      description: "Müşteriye yansıtılan kargo",
      value: formatMoney(breakdown.shipping, locale),
    }] : []),
    ...(showZeroValues || breakdown.tax.amountMinor > 0 ? [{
      key: "tax",
      label: "Vergi",
      description: "Sipariş vergi toplamı",
      value: formatMoney(breakdown.tax, locale),
    }] : []),
  ];

  const paymentRows: SummaryRow[] = paymentSummary ? [
    ...(paymentSummary.installmentFee.amountMinor > 0 || showZeroValues ? [{
      key: "installment-fee",
      label: "Vade farkı",
      description: "Taksitli ödeme için eklenen tutar",
      value: formatMoney(paymentSummary.installmentFee, locale),
    }] : []),
    {
      key: "installment-plan",
      label: "Ödeme planı",
      description: paymentSummary.installmentCount > 0 ? `${paymentSummary.installmentCount} taksit` : "Tek çekim",
      value: installmentPlanText(paymentSummary, locale),
    },
    ...(paymentSummary.cardProgram ? [{
      key: "card-program",
      label: "Kart programı",
      description: "Ödemede kullanılan kart programı",
      value: paymentSummary.cardProgram,
    }] : []),
    ...(paymentSummary.installmentRateBps > 0 ? [{
      key: "installment-rate",
      label: "PayTR oranı",
      description: "Taksit işlemine uygulanan oran",
      value: `%${(paymentSummary.installmentRateBps / 100).toLocaleString(locale, { maximumFractionDigits: 2 })}`,
    }] : []),
  ] : [];

  const fallback = paymentSummary ? fallbackText(paymentSummary) : null;

  return (
    <section className={`ruth-money-summary ${className}`.trim()} {...props}>
      <header className="ruth-money-summary__header">
        <div>
          <span>Finans</span>
          <h3>{title}</h3>
          <p>Sipariş tutarı ile karttan tahsil edilen tutarı ayrı ayrı gösterir.</p>
        </div>
        {showCalculationId ? <code>{breakdown.calculationId}</code> : null}
      </header>

      <div className="ruth-money-summary__content">
        <section className="ruth-money-summary__group" aria-label="Sipariş hesabı">
          <header className="ruth-money-summary__group-header">
            <div>
              <span>1</span>
              <strong>Sipariş hesabı</strong>
            </div>
            <small>Ürün, indirim ve kargo hesabı</small>
          </header>

          <SummaryRows rows={orderRows} />

          <div className="ruth-money-summary__highlight ruth-money-summary__total">
            <div>
              <span>Sipariş toplamı</span>
              <small>Müşterinin sipariş tutarı</small>
            </div>
            <strong>{formatMoney(breakdown.total, locale)}</strong>
          </div>
        </section>

        {paymentSummary ? (
          <section className="ruth-money-summary__group ruth-money-summary__group--payment" aria-label="Kart tahsilatı">
            <header className="ruth-money-summary__group-header">
              <div>
                <span>2</span>
                <strong>Kart tahsilatı</strong>
              </div>
              <small>Taksit ve vade farkı dahil</small>
            </header>

            <SummaryRows rows={paymentRows} />

            <div className="ruth-money-summary__highlight ruth-money-summary__charged">
              <div>
                <span>Karttan çekilen</span>
                <small>Sipariş toplamı + vade farkı</small>
              </div>
              <strong>{formatMoney(paymentSummary.chargedAmount, locale)}</strong>
            </div>
          </section>
        ) : null}
      </div>

      {fallback ? <p className="ruth-money-summary__notice">{fallback}</p> : null}
    </section>
  );
}
