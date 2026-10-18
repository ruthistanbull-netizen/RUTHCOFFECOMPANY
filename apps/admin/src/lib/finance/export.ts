import ExcelJS from "exceljs";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { financeExportFont } from "./exportFont";
const titles: Record<string, string> = {
  net_sales: "Net satış geliri",
  cogs: "Satılan ürün maliyeti",
  gross_profit: "Brüt kâr",
  operating_expenses: "Faaliyet gideri",
  operating_profit: "Faaliyet kârı",
  period_result: "Kayıtlı giderlere göre tahmini kâr",
  cash_in: "Nakit girişleri",
  cash_out: "Nakit çıkışları",
  net_cash: "Net nakit akışı",
  unpaid: "Ödenmemiş giderler",
  receivables: "Beklenen tahsilatlar",
  gross_sales: "Brüt satış",
  discounts: "İndirimler",
  refunds: "İadeler",
  input_tax: "Alış KDV",
  output_tax: "Satış KDV",
};
type Report = {
  currency: string;
  from: string;
  to: string;
  current: Record<string, unknown>;
  monthly: Array<{ date: string; values: Record<string, unknown> }>;
};
export async function exportFinance(
  report: Report,
  format: string,
): Promise<{ bytes: Uint8Array; mime: string; ext: string }> {
  const rows = report.monthly.flatMap((m) =>
    Object.keys(titles).map((k) => [
      m.date,
      titles[k],
      m.values[k] == null ? "Eksik veri" : String(m.values[k]),
      report.currency,
    ]),
  );
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RR HUB";
    const sheet = workbook.addWorksheet("Finans");
    sheet.addRow(["Dönem", "Kalem", "Tutar", "Para birimi"]);
    rows.forEach((r) => sheet.addRow(r));
    sheet.columns.forEach((c, i) => {
      c.width = [16, 43, 24, 16][i];
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    // Decimal strings are intentionally preserved in cells; exports never re-compute totals in floating point.
    const bytes = await workbook.xlsx.writeBuffer();
    return {
      bytes: new Uint8Array(bytes),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: "xlsx",
    };
  }
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(Buffer.from(financeExportFont, "base64"), {
    subset: false,
  });
  let page = pdf.addPage([595, 842]),
    y = 800;
  const draw = (text: string, bold = false) => {
    if (y < 45) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(text, {
      x: 36,
      y,
      size: bold ? 13 : 9,
      font,
      color: rgb(0.08, 0.08, 0.08),
    });
    y -= bold ? 26 : 18;
  };
  draw(`Finans · ${report.from} – ${report.to}`, true);
  draw(
    "Kayıtlı giderlere göre tahmini sonuçlar. Eksik maliyetler kâr olarak gösterilmez.",
  );
  for (const row of rows)
    draw(`${row[0]}  ·  ${row[1]}  ·  ${row[2]} ${row[3]}`);
  return { bytes: await pdf.save(), mime: "application/pdf", ext: "pdf" };
}
