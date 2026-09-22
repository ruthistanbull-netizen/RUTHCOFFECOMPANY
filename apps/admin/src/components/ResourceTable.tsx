"use client";

import { useEffect, useState, type ReactNode } from "react";
import { adminRequest } from "@/lib/adminApi";

type Column = { key: string; label: string; render?: (row: any) => ReactNode };

export function ResourceTable({ endpoint, dataKey, columns, empty }: { endpoint: string; dataKey: string; columns: Column[]; empty: string }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminRequest<any>(endpoint).then((value) => setRows(Array.isArray(value[dataKey]) ? value[dataKey] : [])).catch((caught) => setError(caught instanceof Error ? caught.message : "Veriler alınamadı."));
  }, [endpoint, dataKey]);

  if (error) return <div className="admin-error">{error}</div>;
  if (!rows) return <div className="admin-loading">Veriler yükleniyor…</div>;
  if (!rows.length) return <div className="admin-empty">{empty}</div>;

  return <div className="admin-card admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id || index}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "—")}</td>)}</tr>)}</tbody></table></div>;
}
