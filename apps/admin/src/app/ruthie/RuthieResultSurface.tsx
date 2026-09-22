"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  Boxes,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  HeartHandshake,
  Mail,
  Megaphone,
  PackageSearch,
  RotateCcw,
  ShieldCheck,
  Star,
  Table2,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { ruthMotion, ruthMotionEase } from "@ruth-commerce/ui/motion";
import type {
  RuthiePresentation,
  RuthiePresentationKind,
  RuthiePresentationRow,
} from "@/lib/ruthiePresentation";
import styles from "./RuthieResultSurface.module.css";

type Props = {
  presentation: RuthiePresentation;
  variant?: "popup" | "inline";
  onClose?: () => void;
  onExpand?: () => void;
};

const ICONS: Record<RuthiePresentationKind, LucideIcon> = {
  orders: PackageSearch,
  products: Boxes,
  shipments: Truck,
  customers: Users,
  returns: RotateCcw,
  payments: CircleDollarSign,
  campaigns: Megaphone,
  reviews: Star,
  points: HeartHandshake,
  catalog: Boxes,
  email: Mail,
  health: ShieldCheck,
  generic: Table2,
};

export function RuthieResultSurface({ presentation, variant = "popup", onClose, onExpand }: Props) {
  const inline = variant === "inline";
  const reduceMotion = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const Icon = ICONS[presentation.kind] || Table2;
  const visibleRows = inline ? presentation.rows.slice(0, 3) : presentation.rows;
  const visibleSummary = inline ? presentation.summary.slice(0, 3) : presentation.summary;
  const moduleHref = presentation.rows.find((row) => row.href)?.href;
  const duration = reduceMotion ? ruthMotion.duration.none : ruthMotion.duration.normal;

  const requestClose = () => {
    if (!onClose || closing) return;
    if (reduceMotion) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, ruthMotion.milliseconds.normal);
  };

  const surface = (
    <motion.section
      className={`${styles.surface} ${inline ? styles.inline : ""}`}
      role={inline ? "group" : "dialog"}
      aria-modal={inline ? undefined : true}
      aria-label={presentation.title}
      data-ruthie-result-kind={presentation.kind}
      data-admin-close-motion={inline ? undefined : "shared"}
      initial={inline || reduceMotion ? false : { opacity: 0, y: ruthMotion.distance.standard, scale: ruthMotion.scale.enter }}
      animate={inline
        ? undefined
        : closing
          ? { opacity: 0, y: ruthMotion.distance.subtle, scale: ruthMotion.scale.enter }
          : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration, ease: ruthMotionEase }}
    >
      <header className={styles.header}>
        <span className={styles.icon}><Icon /></span>
        <div className={styles.heading}>
          <small>ROSTA INSIGHT CANLI SONUÇ</small>
          <h2>{presentation.title}</h2>
          <p>{presentation.subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          {moduleHref ? <a href={moduleHref} aria-label="İlgili panel ekranını aç"><ExternalLink /></a> : null}
          {!inline && onClose ? <button type="button" onClick={requestClose} aria-label="Sonuç penceresini kapat"><X /></button> : null}
        </div>
      </header>

      <div className={styles.body}>
        {visibleSummary.length ? (
          <div className={styles.summaryGrid}>
            {visibleSummary.map((item) => (
              <div className={styles.summaryCard} key={`${item.label}-${item.value}`}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {visibleRows.length ? (
          presentation.view === "cards" ? (
            <div className={styles.cards}>
              {visibleRows.map((row) => <ResultCard key={row.id} row={row} presentation={presentation} />)}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {presentation.columns.map((column) => <th key={column.key}>{column.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id}>
                      {presentation.columns.map((column) => <td key={column.key}>{row.values[column.key] || "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !visibleSummary.length ? <div className={styles.empty}>Gösterilecek kayıt bulunamadı.</div> : null}
      </div>

      {inline && onExpand && (presentation.rows.length > 3 || presentation.summary.length > 3) ? (
        <footer className={styles.inlineFooter}>
          <button className={styles.expandButton} type="button" onClick={onExpand}>
            Tümünü aç <ChevronRight />
          </button>
        </footer>
      ) : null}
    </motion.section>
  );

  if (inline) return surface;
  return (
    <motion.div
      className={styles.backdrop}
      role="presentation"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration, ease: ruthMotionEase }}
      style={{ pointerEvents: closing ? "none" : "auto" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {surface}
    </motion.div>
  );
}

function ResultCard({ row, presentation }: { row: RuthiePresentationRow; presentation: RuthiePresentation }) {
  const Icon = ICONS[presentation.kind] || Table2;
  const hidden = new Set(["name", "orderNumber", "tracking", "customer", "status", "payment"]);
  const fields = presentation.columns
    .filter((column) => !hidden.has(column.key) && row.values[column.key])
    .slice(0, 3);
  const content = (
    <>
      {row.imageUrl ? <img className={styles.thumbnail} src={row.imageUrl} alt="" /> : <span className={styles.cardIcon}><Icon /></span>}
      <div className={styles.cardContent}>
        <div className={styles.cardTop}>
          <strong>{row.title}</strong>
          {row.status ? <span className={styles.status}>{row.status}</span> : null}
        </div>
        {row.subtitle ? <p>{row.subtitle}</p> : null}
        {fields.length ? (
          <div className={styles.cardFields}>
            {fields.map((field) => (
              <span key={field.key}><b>{field.label}: </b>{row.values[field.key]}</span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  return row.href
    ? <a className={styles.card} href={row.href}>{content}</a>
    : <div className={styles.card}>{content}</div>;
}
