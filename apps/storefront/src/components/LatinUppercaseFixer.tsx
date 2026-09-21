"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const UPPERCASE_SELECTOR = [
  ".uppercase",
  ".tracking-wide-luxe",
  ".tracking-luxe",
  ".rewards-floating-bubble",
  ".rewards-eyebrow",
  ".ruthie-success-badge",
  "[data-latin-uppercase]",
].join(",");

const TURKISH_SPECIFIC_RE = /[çğıöşüÇĞÖŞÜ]/;
const HAS_DOTTED_I_RE = /İ/;
const LATIN_WORD_RE = /[A-Za-zİ][A-Za-zİ'’\-]*/g;
const TURKISH_ASCII_WORDS = new Set([
  "adet", "ad", "adres", "alisveris", "alışveriş", "ara", "ayar", "bana",
  "begen", "beğen", "bilgi", "bırak", "canli", "canlı", "cikis", "çıkış",
  "devam", "eposta", "fiyat", "giris", "giriş", "hesabim", "hesabım", "hemen",
  "iade", "indirim", "iletisim", "iletişim", "isim", "kargo", "kart", "kazan",
  "kazanma", "kesfet", "keşfet", "kod", "koleksiyon", "kullan", "kullanma",
  "mesaj", "odeme", "ödeme", "ol", "olun", "puan", "puanı", "puanini",
  "puanını", "satin", "satın", "sepet", "siparis", "sipariş", "takip",
  "telefon", "teslimat", "toplam", "urun", "ürün", "uye", "üye", "yeni",
  "yolla", "yollari", "yolları",
]);

function isEnglishVisualWord(token: string) {
  const lowered = token
    .toLocaleLowerCase("tr-TR")
    .replace(/[’']/g, "")
    .replace(/^-+|-+$/g, "");
  if (!lowered || TURKISH_ASCII_WORDS.has(lowered)) return false;
  if (TURKISH_SPECIFIC_RE.test(token)) return false;
  return /[A-Za-zİ]/.test(token);
}

function normalizeEnglishUppercaseWords(value: string) {
  return value.replace(LATIN_WORD_RE, (token) => {
    if (!isEnglishVisualWord(token) && !HAS_DOTTED_I_RE.test(token)) return token;
    return token.replace(/İ/g, "I").toLocaleUpperCase("en-US");
  });
}

function shouldSkipElement(element: Element) {
  return ["script", "style", "textarea", "input", "select"].includes(
    element.tagName.toLowerCase(),
  );
}

function fixTextNodesInside(element: Element) {
  if (shouldSkipElement(element)) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !/[A-Za-zİ]/.test(node.nodeValue)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const nextValue = normalizeEnglishUppercaseWords(node.nodeValue || "");
    if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
  }
}

function scan(root: ParentNode = document) {
  const elements: Element[] = [];
  if (root instanceof Element && root.matches(UPPERCASE_SELECTOR)) {
    elements.push(root);
  }
  if ("querySelectorAll" in root) {
    elements.push(...Array.from(root.querySelectorAll(UPPERCASE_SELECTOR)));
  }
  for (const element of elements) fixTextNodesInside(element);
}

export function LatinUppercaseFixer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/products/")) return;

    const pending = new Set<ParentNode>([document]);
    let idleId = 0;
    const requestIdle =
      window.requestIdleCallback ||
      ((callback: IdleRequestCallback) =>
        window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 300));
    const cancelIdle = window.cancelIdleCallback || window.clearTimeout;

    const flush = () => {
      idleId = 0;
      pending.forEach((root) => scan(root));
      pending.clear();
    };

    const schedule = () => {
      if (!idleId) idleId = requestIdle(flush);
    };
    schedule();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) pending.add(node);
        }
      }
      if (pending.size) schedule();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (idleId) cancelIdle(idleId);
      pending.clear();
    };
  }, [pathname]);

  return null;
}
