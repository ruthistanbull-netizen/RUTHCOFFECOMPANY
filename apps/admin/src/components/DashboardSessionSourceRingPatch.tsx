"use client";

import { useLayoutEffect } from "react";

const RING_SELECTOR = 'svg[aria-label="Oturum kaynakları halka grafiği"]';
const TREND_SELECTOR = 'svg[aria-label="Etkileşimli satış trendi"]';
const OVERLAY_ATTR = "data-ruth-video-session-ring";
const SIGNATURE_ATTR = "data-ruth-session-ring-signature";
const CARD_EXPANDED_ATTR = "data-ruth-session-card-expanded";
const CENTER = 70;
const RADIUS = 46;
const STROKE = 13;
const GAP_DEGREES = 2.6;
const VIDEO_PALETTE = ["#B48B2C", "#5E7786", "#A99370", "#4D7B77", "#87658A", "#7E858C", "#B66A50"];

type Segment = {
  name: string;
  valueText: string;
  percentText: string;
  percent: number;
  color: string;
  row: HTMLElement;
};

function polar(angle: number, radius = RADIUS) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

function arcPath(startAngle: number, endAngle: number) {
  const start = polar(startAngle);
  const end = polar(endAngle);
  const sweep = Math.max(0, endAngle - startAngle);
  return `M ${start.x.toFixed(4)} ${start.y.toFixed(4)} A ${RADIUS} ${RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x.toFixed(4)} ${end.y.toFixed(4)}`;
}

function parsePercent(text: string) {
  const match = text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function segmentRows(svg: SVGSVGElement) {
  const chart = svg.parentElement as HTMLElement | null;
  const layout = chart?.parentElement as HTMLElement | null;
  const legend = layout?.children.item(1) as HTMLElement | null;
  if (!chart || !layout || !legend) return { chart: null, layout: null, legend: null, segments: [] as Segment[] };

  const segments = Array.from(legend.children).map((node, index) => {
    const row = node as HTMLElement;
    const children = Array.from(row.children) as HTMLElement[];
    const name = children[1]?.textContent?.trim() || "Kaynak";
    const raw = children[2]?.textContent?.trim() || "";
    const hasOriginalValue = raw.includes("·");
    const [rawValuePart] = raw.split("·");
    const parsedPercent = parsePercent(raw);
    const parsedPercentText = raw.match(/-?\d+(?:[.,]\d+)?\s*%/)?.[0]?.replace(/\s+/g, "") || `${parsedPercent.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;

    // applyLegendStyle intentionally leaves only the percentage visible in the legend.
    // MutationObserver can run segmentRows again afterwards, so preserve the original
    // session count separately instead of accidentally treating "63%" as "63 sessions".
    if (hasOriginalValue) {
      row.dataset.ruthSessionValueText = rawValuePart?.trim() || "0";
      row.dataset.ruthSessionPercentText = parsedPercentText;
    }

    const valueText = hasOriginalValue
      ? rawValuePart?.trim() || "0"
      : row.dataset.ruthSessionValueText || "0";
    const percentText = hasOriginalValue
      ? parsedPercentText
      : row.dataset.ruthSessionPercentText || parsedPercentText;
    const percent = parsePercent(percentText);

    return {
      name,
      valueText,
      percentText,
      percent,
      color: VIDEO_PALETTE[index % VIDEO_PALETTE.length],
      row,
    } satisfies Segment;
  }).filter((segment) => segment.percent > 0);

  return { chart, layout, legend, segments };
}

function svgNode<K extends keyof SVGElementTagNameMap>(name: K) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function applyLegendStyle(segment: Segment, index: number) {
  const row = segment.row;
  const children = Array.from(row.children) as HTMLElement[];
  Object.assign(row.style, {
    background: "transparent",
    border: "0",
    borderRadius: "0",
    padding: "5px 1px",
    minHeight: "30px",
    transition: "opacity 180ms ease, transform 220ms ease, color 180ms ease",
    cursor: "pointer",
  });
  if (children[0]) {
    Object.assign(children[0].style, {
      background: segment.color,
      width: "9px",
      height: "9px",
      borderRadius: "999px",
      boxShadow: "none",
    });
  }
  if (children[1]) {
    Object.assign(children[1].style, {
      fontSize: "12px",
      fontWeight: "500",
      color: "hsl(var(--text-main))",
      overflow: "visible",
      textOverflow: "clip",
      whiteSpace: "normal",
    });
  }
  if (children[2]) {
    children[2].textContent = segment.percentText;
    Object.assign(children[2].style, {
      fontSize: "11px",
      color: "hsl(var(--text-muted))",
      fontVariantNumeric: "tabular-nums",
    });
  }
  row.dataset.ruthRingIndex = String(index);
}

function cleanupOldRing(chart: HTMLElement) {
  chart.querySelector(`svg[${OVERLAY_ATTR}]`)?.remove();
  chart.querySelector('[data-ruth-ring-tooltip="true"]')?.remove();
}

function buildInteractiveRing(svg: SVGSVGElement, reduceMotion: boolean, mobile: boolean) {
  const { chart, layout, legend, segments } = segmentRows(svg);
  if (!chart || !layout || !legend || !segments.length) return null;

  const signature = segments.map((segment) => `${segment.name}:${segment.valueText}:${segment.percentText}`).join("|");
  const existing = chart.querySelector<SVGSVGElement>(`svg[${OVERLAY_ATTR}]`);
  if (existing && chart.getAttribute(SIGNATURE_ATTR) === signature) return { chart, layout };

  cleanupOldRing(chart);
  chart.setAttribute(SIGNATURE_ATTR, signature);
  chart.style.position = "relative";
  chart.style.overflow = "visible";
  chart.style.width = mobile ? "190px" : "172px";
  chart.style.height = mobile ? "190px" : "172px";
  chart.style.maxWidth = "100%";
  svg.style.opacity = "0";
  svg.style.pointerEvents = "none";
  const centerCopy = chart.querySelector<HTMLElement>("div.pointer-events-none");
  if (centerCopy) centerCopy.style.display = "none";

  Object.assign(layout.style, {
    alignItems: "center",
    gap: mobile ? "14px" : "18px",
  });
  if (mobile) {
    layout.style.gridTemplateColumns = "minmax(0,1fr)";
    const card = chart.closest<HTMLElement>('[role="button"]');
    if (card) {
      card.setAttribute(CARD_EXPANDED_ATTR, "true");
      card.style.gridColumn = "1 / -1";
    }
  }

  const overlay = svgNode("svg");
  overlay.setAttribute("viewBox", "0 0 140 140");
  overlay.setAttribute(OVERLAY_ATTR, "true");
  overlay.setAttribute("role", "img");
  overlay.setAttribute("aria-label", "Oturum kaynakları etkileşimli halka grafiği");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    overflow: "visible",
    touchAction: "manipulation",
    zIndex: "2",
  });

  const track = svgNode("circle");
  track.setAttribute("cx", String(CENTER));
  track.setAttribute("cy", String(CENTER));
  track.setAttribute("r", String(RADIUS));
  track.setAttribute("fill", "none");
  track.setAttribute("stroke", "hsl(var(--surface-tertiary))");
  track.setAttribute("stroke-width", String(STROKE));
  track.setAttribute("opacity", ".65");
  overlay.append(track);

  const tooltip = document.createElement("div");
  tooltip.dataset.ruthRingTooltip = "true";
  Object.assign(tooltip.style, {
    position: "absolute",
    zIndex: "5",
    minWidth: "112px",
    maxWidth: "150px",
    padding: "9px 10px",
    borderRadius: "10px",
    border: "1px solid hsl(var(--border-subtle))",
    background: "hsl(var(--surface-primary))",
    boxShadow: "0 10px 28px rgba(0,0,0,.12)",
    color: "hsl(var(--text-main))",
    pointerEvents: "none",
    opacity: "0",
    transform: "translate(-50%, -50%) scale(.96)",
    transition: "opacity 160ms ease, transform 220ms cubic-bezier(.22,1,.36,1)",
  });
  chart.append(tooltip);

  const totalPercent = segments.reduce((sum, segment) => sum + segment.percent, 0) || 100;
  const paths: SVGPathElement[] = [];
  const midpoints: Array<{ x: number; y: number }> = [];
  let cursor = 0;
  let pinned: number | null = null;
  let hovered: number | null = null;

  const show = (index: number | null) => {
    const active = pinned ?? index;
    hovered = index;
    paths.forEach((path, pathIndex) => {
      path.style.opacity = active == null || active === pathIndex ? "1" : ".42";
      path.setAttribute("stroke-width", String(active === pathIndex ? STROKE + 3 : STROKE));
    });
    segments.forEach((segment, segmentIndex) => {
      segment.row.style.opacity = active == null || active === segmentIndex ? "1" : ".5";
      segment.row.style.transform = active === segmentIndex ? "translateX(3px)" : "translateX(0)";
    });
    if (active == null) {
      tooltip.style.opacity = "0";
      tooltip.style.transform = "translate(-50%, -50%) scale(.96)";
      return;
    }
    const segment = segments[active];
    const point = midpoints[active];
    const left = Math.max(23, Math.min(77, point.x / 140 * 100));
    const top = Math.max(22, Math.min(78, point.y / 140 * 100));
    tooltip.innerHTML = `<div style="font-size:11px;font-weight:650;line-height:1.2">${segment.name}</div><div style="margin-top:4px;font-size:10px;color:hsl(var(--text-muted));white-space:nowrap">${segment.valueText} oturum · ${segment.percentText}</div>`;
    tooltip.style.left = `${left}%`;
    tooltip.style.top = `${top}%`;
    tooltip.style.opacity = "1";
    tooltip.style.transform = "translate(-50%, -50%) scale(1)";
  };

  segments.forEach((segment, index) => {
    applyLegendStyle(segment, index);
    const ratio = segment.percent / totalPercent;
    const rawSpan = 360 * ratio;
    const gap = Math.min(GAP_DEGREES, Math.max(.8, rawSpan * .18));
    const startAngle = cursor + gap / 2;
    const endAngle = cursor + rawSpan - gap / 2;
    const midAngle = (startAngle + endAngle) / 2;
    cursor += rawSpan;
    if (endAngle <= startAngle) return;

    const path = svgNode("path");
    path.setAttribute("d", arcPath(startAngle, endAngle));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", segment.color);
    path.setAttribute("stroke-width", String(STROKE));
    path.setAttribute("stroke-linecap", "butt");
    path.setAttribute("role", "button");
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", `${segment.name}: ${segment.valueText} oturum, ${segment.percentText}`);
    Object.assign(path.style, {
      cursor: "pointer",
      transition: "opacity 180ms ease, stroke-width 180ms cubic-bezier(.22,1,.36,1)",
      outline: "none",
    });
    overlay.append(path);
    paths.push(path);
    midpoints.push(polar(midAngle, 49));

    const activate = () => show(index);
    const leave = () => { if (pinned == null) show(null); };
    const toggle = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      pinned = pinned === index ? null : index;
      show(pinned);
    };
    path.addEventListener("pointerenter", activate);
    path.addEventListener("pointerleave", leave);
    path.addEventListener("pointerdown", (event) => event.stopPropagation());
    path.addEventListener("click", toggle);
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") toggle(event);
      if (event.key === "Escape") { pinned = null; show(null); }
    });

    segment.row.onpointerenter = activate;
    segment.row.onpointerleave = leave;
    segment.row.onpointerdown = (event) => event.stopPropagation();
    segment.row.onclick = toggle;

    if (!reduceMotion) {
      const length = path.getTotalLength();
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      path.style.opacity = "0";
      path.animate(
        [
          { strokeDashoffset: `${length}`, opacity: 0 },
          { strokeDashoffset: "0", opacity: 1 },
        ],
        {
          duration: 680,
          delay: 80 + index * 72,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "forwards",
        },
      );
      segment.row.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 360,
          delay: 150 + index * 55,
          easing: "cubic-bezier(.22,1,.36,1)",
          fill: "both",
        },
      );
    }
  });

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target !== track && event.target !== overlay) return;
    event.stopPropagation();
    pinned = null;
    show(null);
  });

  chart.append(overlay);
  legend.setAttribute("data-ruth-video-legend", "true");
  return { chart, layout };
}

function applyTrendMobile(svg: SVGSVGElement, mobile: boolean) {
  const host = svg.parentElement as HTMLElement | null;
  if (!host) return;
  host.setAttribute("data-ruth-mobile-trend-host", "true");
  if (mobile) {
    Object.assign(host.style, {
      overflowX: "auto",
      overflowY: "hidden",
      WebkitOverflowScrolling: "touch",
      overscrollBehaviorX: "contain",
      paddingBottom: "4px",
    });
    Object.assign(svg.style, {
      width: "720px",
      minWidth: "720px",
      height: "300px",
      minHeight: "300px",
      maxWidth: "none",
      touchAction: "pan-x pan-y",
    });
  } else {
    host.style.overflowX = "";
    host.style.overflowY = "";
    host.style.paddingBottom = "";
    svg.style.width = "";
    svg.style.minWidth = "";
    svg.style.height = "";
    svg.style.minHeight = "";
    svg.style.maxWidth = "";
    svg.style.touchAction = "";
  }
}

export function DashboardSessionSourceRingPatch() {
  useLayoutEffect(() => {
    let frame = 0;
    let disposed = false;
    let expandedCard: HTMLElement | null = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const media = window.matchMedia("(max-width: 640px)");

    const apply = () => {
      frame = 0;
      if (disposed) return;
      const mobile = media.matches;
      const rings = document.querySelectorAll<SVGSVGElement>(RING_SELECTOR);
      if (!rings.length && expandedCard) {
        expandedCard.style.gridColumn = "";
        expandedCard.removeAttribute(CARD_EXPANDED_ATTR);
        expandedCard = null;
      }
      rings.forEach((svg) => {
        const result = buildInteractiveRing(svg, reduceMotion, mobile);
        const card = result?.chart.closest<HTMLElement>('[role="button"]') || null;
        if (mobile && card) expandedCard = card;
      });
      document.querySelectorAll<SVGSVGElement>(TREND_SELECTOR).forEach((svg) => applyTrendMobile(svg, mobile));
    };

    const schedule = () => {
      if (frame || disposed) return;
      frame = window.requestAnimationFrame(apply);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    media.addEventListener("change", schedule);
    apply();

    return () => {
      disposed = true;
      observer.disconnect();
      media.removeEventListener("change", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll<SVGSVGElement>(RING_SELECTOR).forEach((svg) => {
        const chart = svg.parentElement as HTMLElement | null;
        if (!chart) return;
        cleanupOldRing(chart);
        chart.removeAttribute(SIGNATURE_ATTR);
        chart.style.width = "";
        chart.style.height = "";
        chart.style.overflow = "";
        svg.style.opacity = "";
        svg.style.pointerEvents = "";
        const center = chart.querySelector<HTMLElement>("div.pointer-events-none");
        if (center) center.style.display = "";
      });
      document.querySelectorAll<HTMLElement>(`[${CARD_EXPANDED_ATTR}]`).forEach((card) => {
        card.style.gridColumn = "";
        card.removeAttribute(CARD_EXPANDED_ATTR);
      });
      document.querySelectorAll<SVGSVGElement>(TREND_SELECTOR).forEach((svg) => applyTrendMobile(svg, false));
    };
  }, []);

  return null;
}