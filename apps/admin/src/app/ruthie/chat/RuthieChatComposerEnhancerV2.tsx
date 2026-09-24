"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Package,
  Paperclip,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import styles from "./RuthieChatComposerEnhancerV2.module.css";

type Targets = {
  root: HTMLElement;
  composer: HTMLElement;
  tools: HTMLElement;
  textarea: HTMLTextAreaElement;
  fileInput: HTMLInputElement;
  sendButton: HTMLButtonElement | null;
};

type MenuMode = "plus" | "at" | null;
type ImageQuality = "low" | "medium" | "high";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
type ImageStage = "idle" | "quoting" | "quote" | "generating" | "done";
type ImagePanel = "products" | "style" | null;

type Preview = {
  id: string;
  signature: string;
  name: string;
  type: string;
  url?: string;
};

type ProductRef = {
  id: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  stockStatus: string | null;
};

type StyleGroup = {
  id: string;
  label: string;
  description: string;
  options: string[];
};

type StyleSelection = {
  groupId: string;
  groupLabel: string;
  option: string;
};

type ExtraKey = "framing" | "background" | "lighting" | "usage" | "platform";
type ExtraSelections = Record<ExtraKey, string>;

type ImageQuote = {
  token: string;
  model: string;
  quality: ImageQuality;
  size: ImageSize;
  estimatedUsd: number;
  currency: "USD";
  expiresAt: string;
  note?: string;
  referenceCount?: number;
};

type GeneratedImage = {
  dataUrl: string;
  mimeType: string;
  name: string;
  model: string;
  quality: ImageQuality;
  size: ImageSize;
};

const IMAGE_COMMAND = "@Fotoğraf üret";
const MAX_PRODUCTS = 6;

const QUALITY_LABELS: Record<ImageQuality, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

const SIZE_LABELS: Record<ImageSize, string> = {
  "1024x1024": "Kare",
  "1024x1536": "Dikey",
  "1536x1024": "Yatay",
};

const STYLE_GROUPS: StyleGroup[] = [
  { id: "model", label: "Model Üzerinde", description: "Takının gerçek kullanımını model üzerinde göster", options: ["Yüz görünür", "Yüz yarım görünür", "Sadece boyun yakın plan", "Sadece kulak yakın plan", "Sadece el yakın plan", "Tek model", "Editorial model"] },
  { id: "studio", label: "Stüdyo Ürün Fotoğrafı", description: "Temiz ve e-ticaret odaklı ürün çekimi", options: ["Beyaz fon", "Krem fon", "Koyu lüks fon", "Soft gölgeli", "E-ticaret uyumlu", "İzole ürün görünümü"] },
  { id: "campaign", label: "Lüks Kampanya Görseli", description: "Marka kampanyası ve reklam hissi", options: ["Dramatik ışık", "Premium fon", "Reklam afiş hissi", "Güçlü gölge", "Marka kampanyası hissi"] },
  { id: "lifestyle", label: "Lifestyle / Günlük Kullanım", description: "Doğal ve gerçek kullanım odaklı", options: ["Doğal masa", "Ayna önü", "Kumaş üstü", "Elde kullanım", "Günlük ortam"] },
  { id: "flatlay", label: "Flat Lay / Masa Üstü", description: "Yukarıdan düzenlenmiş ürün kompozisyonu", options: ["Yukarıdan çekim", "Dekorlu", "Sade", "Çoklu ürün yerleşimi", "Set düzeni"] },
  { id: "macro", label: "Makro / Detay Çekim", description: "Taş, metal ve işçilik detaylarını öne çıkar", options: ["Taş detayı", "Metal doku", "İşçilik yakın plan", "Ultra yakın çekim"] },
  { id: "hand", label: "Elde Tutulan Ürün", description: "Ürünü elde doğal biçimde göster", options: ["Tek elde tutma", "İki elde sunum", "Kutudan çıkarma"] },
  { id: "mirror", label: "Ayna Yansımalı", description: "Yansıma ile editoryal ve premium görünüm", options: ["Tam yansıma", "Kısmi yansıma", "Lüks zemin yansıması"] },
  { id: "stilllife", label: "Still Life / Obje Kompozisyonu", description: "Ürünleri seçili dekor objeleriyle kurgula", options: ["Taşlarla", "Kumaşla", "Metal objelerle", "Çiçeklerle", "Deniz temalı objelerle"] },
  { id: "editorial", label: "Editorial / Moda Çekimi", description: "Dergi ve moda kampanyası estetiği", options: ["Moda çekimi", "Dramatik kompozisyon", "Dergi tarzı", "Artistik ışık"] },
  { id: "lookbook", label: "Lookbook Tarzı", description: "Seri üretime uygun temiz koleksiyon dili", options: ["Sade fon", "Koleksiyon havası", "Temiz kadraj", "Premium moda sunumu"] },
  { id: "poster", label: "Reklam Afişi Tarzı", description: "Performans reklamı ve hero kreatif", options: ["Yazısız afiş", "Yazılı afiş", "Hero ürün", "Dikkat çekici kompozisyon"] },
  { id: "ugc", label: "UGC / Sosyal Medya Tarzı", description: "Daha doğal ve kullanıcı çekimi hissi", options: ["Doğal çekim", "Telefon kamerası hissi", "Sosyal medya görünümü", "Kullanıcı deneyimi havası"] },
  { id: "packaging", label: "Paketleme / Kutu İçinde", description: "Hediye ve kutu deneyimini göster", options: ["Kutu içinde", "Kutudan çıkarken", "Hediye paketi", "Premium ambalaj"] },
  { id: "set", label: "Kombin / Set Görseli", description: "Birden fazla ürünü birlikte sun", options: ["Kolye + küpe", "Yüzük + küpe", "Tam set", "Çoklu ürün premium sunum"] },
  { id: "season", label: "Sezon Temalı", description: "Kampanya dönemine göre atmosfer oluştur", options: ["Yaz", "Sonbahar", "Gece", "Beach", "Bridal", "Özel gün", "Yılbaşı", "Sevgililer günü"] },
];

const EXTRA_GROUPS: Array<{ id: ExtraKey; label: string; options: string[] }> = [
  { id: "framing", label: "Kadraj", options: ["Yakın plan", "Orta plan", "Tam görünüm"] },
  { id: "background", label: "Arka plan", options: ["Beyaz", "Krem", "Koyu", "Dekorlu"] },
  { id: "lighting", label: "Işık", options: ["Soft", "Parlak", "Dramatik", "Sıcak"] },
  { id: "usage", label: "Ürün kullanımı", options: ["Tek ürün", "Çoklu ürün", "Set"] },
  { id: "platform", label: "Platform", options: ["Website", "Instagram post", "Story", "Reklam"] },
];

const EMPTY_EXTRAS: ExtraSelections = {
  framing: "",
  background: "",
  lighting: "",
  usage: "",
  platform: "",
};

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatPrice(product: ProductRef) {
  if (product.price == null || !Number.isFinite(product.price)) return "";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: product.currency || "TRY", maximumFractionDigits: 0 }).format(product.price);
  } catch {
    return `${product.price} ${product.currency || "TRY"}`;
  }
}

function nativeSetTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function currentAtQuery(textarea: HTMLTextAreaElement) {
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  return match ? match[2] : null;
}

function replaceCurrentAtToken(textarea: HTMLTextAreaElement, replacement: string) {
  const cursor = textarea.selectionStart ?? textarea.value.length;
  const before = textarea.value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  if (!match || match.index == null) {
    const prefix = textarea.value.trim() ? `${textarea.value.trimEnd()} ` : "";
    const next = `${prefix}${replacement} `;
    nativeSetTextareaValue(textarea, next);
    window.setTimeout(() => textarea.setSelectionRange(next.length, next.length), 0);
    return;
  }
  const tokenStart = match.index + (match[1] ? match[1].length : 0);
  const head = textarea.value.slice(0, tokenStart);
  const tail = textarea.value.slice(cursor);
  const spacer = head && !head.endsWith(" ") ? " " : "";
  const next = `${head}${spacer}${replacement} ${tail}`.replace(/\s{2,}/g, " ");
  nativeSetTextareaValue(textarea, next);
  const caret = Math.min(next.indexOf(replacement, tokenStart) + replacement.length + 1, next.length);
  window.setTimeout(() => textarea.setSelectionRange(caret, caret), 0);
}

function removeImageCommand(textarea: HTMLTextAreaElement) {
  const next = textarea.value
    .replace(/@fotoğraf\s*üret/giu, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
  nativeSetTextareaValue(textarea, next);
  window.setTimeout(() => textarea.setSelectionRange(next.length, next.length), 0);
}

function imagePromptFromTextarea(textarea: HTMLTextAreaElement) {
  return textarea.value.replace(/@fotoğraf\s*üret/giu, "").replace(/\s+/g, " ").trim();
}

function previewSignature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function RuthieChatComposerEnhancerV2() {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>(null);
  const [atQuery, setAtQuery] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [imageSelected, setImageSelected] = useState(false);
  const [imagePanel, setImagePanel] = useState<ImagePanel>(null);
  const [quality, setQuality] = useState<ImageQuality>("medium");
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [imageStage, setImageStage] = useState<ImageStage>("idle");
  const [quote, setQuote] = useState<ImageQuote | null>(null);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [actualCost, setActualCost] = useState<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<ProductRef[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleSelection | null>(null);
  const [expandedStyle, setExpandedStyle] = useState<string | null>(STYLE_GROUPS[0]?.id || null);
  const [expandedExtra, setExpandedExtra] = useState<ExtraKey | null>(null);
  const [extras, setExtras] = useState<ExtraSelections>(EMPTY_EXTRAS);
  const nativeAttachmentsRef = useRef<HTMLElement | null>(null);
  const objectUrlsRef = useRef(new Set<string>());

  const invalidateQuote = useCallback(() => {
    setQuote(null);
    setImageStage((current) => current === "generating" ? current : "idle");
    setImageError(null);
  }, []);

  useEffect(() => {
    const discover = () => {
      const root = document.querySelector<HTMLElement>('[data-ruthie-experience="chat"]');
      if (!root) return;
      const textarea = root.querySelector<HTMLTextAreaElement>('textarea[placeholder*="ROSTA Insight"]');
      const fileInput = root.querySelector<HTMLInputElement>('input[type="file"]');
      const composer = textarea?.parentElement;
      const tools = fileInput?.parentElement;
      const sendButton = root.querySelector<HTMLButtonElement>('button[aria-label="Gönder"]');
      if (!textarea || !fileInput || !composer || !tools) return;
      setTargets((current) => current?.textarea === textarea && current.fileInput === fileInput
        ? { ...current, sendButton }
        : { root, textarea, fileInput, composer, tools, sendButton });
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!targets) return;
    const nativeButton = targets.tools.querySelector<HTMLElement>('button[aria-label="Dosya ekle"]');
    const previousDisplay = nativeButton?.style.display ?? "";
    if (nativeButton) nativeButton.style.display = "none";
    return () => {
      if (nativeButton) nativeButton.style.display = previousDisplay;
    };
  }, [targets]);

  useEffect(() => {
    if (!targets) return;
    const textarea = targets.textarea;
    const onInput = () => {
      const query = currentAtQuery(textarea);
      if (query === null) {
        setAtQuery("");
        setMenuMode((current) => current === "at" ? null : current);
      } else {
        setAtQuery(query);
        setMenuMode("at");
      }
      const hasImageCommand = /@fotoğraf\s*üret/iu.test(textarea.value);
      if (hasImageCommand && !imageSelected) setImageSelected(true);
      if (!hasImageCommand && imageSelected) {
        setImageSelected(false);
        setImagePanel(null);
        setImageStage("idle");
        setQuote(null);
        setGenerated(null);
        setImageError(null);
      }
    };
    textarea.addEventListener("input", onInput);
    textarea.addEventListener("focus", onInput);
    onInput();
    return () => {
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("focus", onInput);
    };
  }, [imageSelected, targets]);

  useEffect(() => {
    if (!targets) return;
    const fileInput = targets.fileInput;
    const onFileCapture = () => {
      const selected = Array.from(fileInput.files || []);
      if (!selected.length) return;
      setPreviews((current) => {
        const next = [...current];
        for (const file of selected) {
          const signature = previewSignature(file);
          if (next.some((item) => item.signature === signature)) continue;
          let url: string | undefined;
          if (file.type.startsWith("image/")) {
            url = URL.createObjectURL(file);
            objectUrlsRef.current.add(url);
          }
          next.push({ id: id("preview"), signature, name: file.name, type: file.type, url });
        }
        return next.slice(-4);
      });
    };
    fileInput.addEventListener("change", onFileCapture, true);
    return () => fileInput.removeEventListener("change", onFileCapture, true);
  }, [targets]);

  useEffect(() => {
    if (!targets) return;
    const area = targets.composer.parentElement;
    if (!area) return;
    const syncNativeAttachments = () => {
      const candidate = targets.composer.previousElementSibling;
      if (!(candidate instanceof HTMLElement) || !candidate.querySelector("button")) return;
      nativeAttachmentsRef.current = candidate;
      candidate.style.display = "none";
    };
    syncNativeAttachments();
    const observer = new MutationObserver(syncNativeAttachments);
    observer.observe(area, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [targets]);

  useEffect(() => () => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!menuMode) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest("[data-ruthie-composer-enhancer-menu]") || target.closest("[data-ruthie-composer-enhancer-trigger]")) return;
      if (targets?.textarea === target) return;
      setMenuMode(null);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuMode(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuMode, targets]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!imageSelected || imagePanel !== "products") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setProductsLoading(true);
        setProductError(null);
        try {
          const headers = await adminAuthHeaders();
          const query = productQuery.trim();
          const response = await fetch(`/api/products/list${query ? `?q=${encodeURIComponent(query)}` : ""}`, { headers, cache: "no-store" });
          const payload = await response.json().catch(() => null) as any;
          if (!response.ok || !payload?.ok || !Array.isArray(payload.products)) throw new Error(payload?.error || "Ürünler alınamadı.");
          if (cancelled) return;
          const mapped = payload.products.slice(0, 40).map((product: any): ProductRef => ({
            id: String(product.id),
            name: String(product.name || "Ürün"),
            imageUrl: typeof product.main_image_url === "string" ? product.main_image_url : null,
            price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
            currency: String(product.currency || "TRY"),
            stockStatus: product.stock_status ? String(product.stock_status) : null,
          }));
          setProducts(mapped);
        } catch (caught) {
          if (!cancelled) setProductError(caught instanceof Error ? caught.message : "Ürünler alınamadı.");
        } finally {
          if (!cancelled) setProductsLoading(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imagePanel, imageSelected, productQuery]);

  const menuItems = useMemo(() => {
    const items = [
      { id: "attach", label: "Fotoğraf veya dosya ekle", detail: "Görsel, PDF, Word, Excel ve daha fazlası", icon: Paperclip },
      { id: "generate", label: "Fotoğraf üret", detail: "Ürün, tarz, kalite ve boyutu seç; fiyatı gör", icon: WandSparkles },
    ];
    if (menuMode !== "at" || !atQuery.trim()) return items;
    const query = normalizeSearch(atQuery);
    return items.filter((item) => normalizeSearch(`${item.label} ${item.detail} ${item.id === "generate" ? "fotoğrafüret fotoğraf üret" : "dosya ekle"}`).includes(query));
  }, [atQuery, menuMode]);

  const chooseMenuItem = useCallback((itemId: string) => {
    if (!targets) return;
    setMenuMode(null);
    if (itemId === "attach") {
      if (currentAtQuery(targets.textarea) !== null) {
        const cursor = targets.textarea.selectionStart ?? targets.textarea.value.length;
        const before = targets.textarea.value.slice(0, cursor);
        const match = /(^|\s)@([^\s@]*)$/.exec(before);
        if (match && match.index != null) {
          const tokenStart = match.index + (match[1] ? match[1].length : 0);
          nativeSetTextareaValue(targets.textarea, `${targets.textarea.value.slice(0, tokenStart)}${targets.textarea.value.slice(cursor)}`.replace(/\s{2,}/g, " "));
        }
      }
      targets.fileInput.click();
      return;
    }
    replaceCurrentAtToken(targets.textarea, IMAGE_COMMAND);
    setImageSelected(true);
    setImagePanel(null);
    setImageStage("idle");
    setQuote(null);
    setGenerated(null);
    setActualCost(null);
    setImageError(null);
    window.setTimeout(() => targets.textarea.focus(), 20);
  }, [targets]);

  const removePreview = (preview: Preview) => {
    const native = nativeAttachmentsRef.current;
    const matching = native ? Array.from(native.children).find((child) => (child.textContent || "").includes(preview.name)) : null;
    matching?.querySelector<HTMLButtonElement>("button")?.click();
    if (preview.url) {
      URL.revokeObjectURL(preview.url);
      objectUrlsRef.current.delete(preview.url);
    }
    setPreviews((current) => current.filter((item) => item.id !== preview.id));
  };

  const toggleProduct = (product: ProductRef) => {
    setSelectedProducts((current) => {
      if (current.some((item) => item.id === product.id)) return current.filter((item) => item.id !== product.id);
      if (current.length >= MAX_PRODUCTS) {
        setProductError(`En fazla ${MAX_PRODUCTS} ürün seçebilirsin.`);
        return current;
      }
      setProductError(null);
      return [...current, product];
    });
    invalidateQuote();
  };

  const chooseStyle = (group: StyleGroup, option: string) => {
    setSelectedStyle({ groupId: group.id, groupLabel: group.label, option });
    invalidateQuote();
  };

  const setExtra = (key: ExtraKey, value: string) => {
    setExtras((current) => ({ ...current, [key]: current[key] === value ? "" : value }));
    invalidateQuote();
  };

  const generationContext = useMemo(() => ({
    productIds: selectedProducts.map((item) => item.id),
    style: {
      category: selectedStyle?.groupLabel || "",
      variant: selectedStyle?.option || "",
      framing: extras.framing,
      background: extras.background,
      lighting: extras.lighting,
      usage: extras.usage,
      platform: extras.platform,
    },
  }), [extras, selectedProducts, selectedStyle]);

  const requestQuote = useCallback(async () => {
    if (!targets || imageStage === "quoting" || imageStage === "generating") return;
    const rawPrompt = imagePromptFromTextarea(targets.textarea);
    const prompt = rawPrompt || (selectedProducts.length || selectedStyle ? "Seçili ürün ve fotoğraf ayarlarına göre premium bir görsel oluştur." : "");
    if (!prompt) {
      setImageError("Nasıl bir görsel istediğini yaz veya ürün/fotoğraf tarzı seç.");
      return;
    }
    setImageStage("quoting");
    setQuote(null);
    setImageError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/openai/image-v2", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, quality, size, ...generationContext }),
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || !payload?.ok || !payload?.quote?.token) throw new Error(payload?.error || "Görsel fiyatı alınamadı.");
      setQuote(payload.quote as ImageQuote);
      setImageStage("quote");
    } catch (caught) {
      setImageError(caught instanceof Error ? caught.message : "Görsel fiyatı alınamadı.");
      setImageStage("idle");
    }
  }, [generationContext, imageStage, selectedProducts.length, selectedStyle, quality, size, targets]);

  useEffect(() => {
    if (!targets || !imageSelected) return;
    const textarea = targets.textarea;
    const sendButton = targets.sendButton;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void requestQuote();
    };
    const onSendClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      void requestQuote();
    };
    textarea.addEventListener("keydown", onKeyDown, true);
    sendButton?.addEventListener("click", onSendClick, true);
    return () => {
      textarea.removeEventListener("keydown", onKeyDown, true);
      sendButton?.removeEventListener("click", onSendClick, true);
    };
  }, [imageSelected, requestQuote, targets]);

  const attachGeneratedImage = async (image: GeneratedImage) => {
    if (!targets) throw new Error("ROSTA Insight dosya alanı bulunamadı.");
    const response = await fetch(image.dataUrl);
    const blob = await response.blob();
    const file = new File([blob], image.name, { type: image.mimeType || blob.type || "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    targets.fileInput.files = transfer.files;
    targets.fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const confirmGeneration = async () => {
    if (!targets || !quote || imageStage === "generating") return;
    const rawPrompt = imagePromptFromTextarea(targets.textarea);
    const prompt = rawPrompt || "Seçili ürün ve fotoğraf ayarlarına göre premium bir görsel oluştur.";
    setImageStage("generating");
    setImageError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/openai/image-v2", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, quality, size, ...generationContext, quoteToken: quote.token, confirmed: true }),
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || !payload?.ok || !payload?.image?.dataUrl) throw new Error(payload?.error || "Görsel üretilemedi.");
      const image = payload.image as GeneratedImage;
      await attachGeneratedImage(image);
      setGenerated(image);
      const billed = typeof payload?.cost?.actualUsd === "number" ? payload.cost.actualUsd : null;
      setActualCost(billed);
      setImageStage("done");
      setToast(`Fotoğraf üretildi ve sohbete eklendi${billed != null ? ` · ${formatUsd(billed)}` : ""}`);
      removeImageCommand(targets.textarea);
      setImageSelected(false);
      setImagePanel(null);
      setSelectedProducts([]);
      setSelectedStyle(null);
      setExtras(EMPTY_EXTRAS);
      setQuote(null);
    } catch (caught) {
      setImageError(caught instanceof Error ? caught.message : "Görsel üretilemedi.");
      setImageStage("quote");
    }
  };

  const cancelImageMode = () => {
    if (!targets || imageStage === "generating") return;
    removeImageCommand(targets.textarea);
    setImageSelected(false);
    setImagePanel(null);
    setImageStage("idle");
    setQuote(null);
    setGenerated(null);
    setActualCost(null);
    setImageError(null);
    setSelectedProducts([]);
    setSelectedStyle(null);
    setExtras(EMPTY_EXTRAS);
    window.setTimeout(() => targets.textarea.focus(), 30);
  };

  if (!targets || typeof document === "undefined") return null;

  const dockOffset = previews.length ? 84 : 10;
  const menuOffset = imageSelected ? dockOffset + 360 : dockOffset;

  return (
    <>
      {createPortal(
        <motion.button
          type="button"
          data-ruthie-composer-enhancer-trigger
          className={styles.plusButton}
          aria-label="ROSTA Insight araçlarını aç"
          aria-expanded={Boolean(menuMode)}
          onClick={() => setMenuMode((current) => current === "plus" ? null : "plus")}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.92 }}
        >
          <motion.span animate={{ rotate: menuMode === "plus" ? 45 : 0 }} transition={{ duration: 0.18 }}><Plus /></motion.span>
        </motion.button>,
        targets.tools,
      )}

      {createPortal(
        <>
          <AnimatePresence initial={false}>
            {previews.length ? (
              <motion.div className={styles.previewStrip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.18 }}>
                {previews.map((preview) => (
                  <motion.div key={preview.id} className={styles.previewCard} layout initial={{ opacity: 0, scale: 0.95, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 4 }} transition={{ duration: 0.18 }}>
                    <div className={styles.previewVisual}>{preview.url ? <img src={preview.url} alt="" /> : <FileText />}</div>
                    <div className={styles.previewText}><strong>{preview.name}</strong><span>{preview.type.startsWith("image/") ? "Fotoğraf" : "Dosya"}</span></div>
                    <motion.button type="button" onClick={() => removePreview(preview)} aria-label={`${preview.name} dosyasını kaldır`} whileTap={{ scale: 0.86 }}><X /></motion.button>
                  </motion.div>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {imageSelected ? (
              <motion.div
                className={styles.imageDock}
                style={{ bottom: `calc(100% + ${dockOffset}px)` }}
                initial={{ opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.985 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              >
                <div className={styles.imageDockTop}>
                  <span className={styles.commandPill}><WandSparkles />{IMAGE_COMMAND}<motion.button type="button" onClick={cancelImageMode} whileTap={{ scale: 0.86 }} aria-label="Fotoğraf üret aracını kaldır"><X /></motion.button></span>
                  <span className={styles.imageDockHint}>{imageStage === "quoting" ? "Fiyat hesaplanıyor…" : imageStage === "generating" ? "Üretiliyor…" : "Görsel ayarları"}</span>
                </div>

                <div className={styles.primaryControls}>
                  <div className={styles.optionGroup}><span>Kalite</span><div>{(Object.keys(QUALITY_LABELS) as ImageQuality[]).map((item) => <motion.button key={item} type="button" data-active={quality === item ? "true" : "false"} onClick={() => { setQuality(item); invalidateQuote(); }} whileTap={{ scale: 0.96 }}>{quality === item ? <Check /> : null}{QUALITY_LABELS[item]}</motion.button>)}</div></div>
                  <div className={styles.optionGroup}><span>Boyut</span><div>{(Object.keys(SIZE_LABELS) as ImageSize[]).map((item) => <motion.button key={item} type="button" data-active={size === item ? "true" : "false"} onClick={() => { setSize(item); invalidateQuote(); }} whileTap={{ scale: 0.96 }}>{size === item ? <Check /> : null}{SIZE_LABELS[item]}</motion.button>)}</div></div>
                  <div className={styles.optionGroup}><span>İçerik</span><div className={styles.featureButtons}>
                    <motion.button type="button" data-active={imagePanel === "products" || selectedProducts.length > 0 ? "true" : "false"} onClick={() => setImagePanel((current) => current === "products" ? null : "products")} whileTap={{ scale: 0.96 }}><Package /> Ürün ekle{selectedProducts.length ? <b>{selectedProducts.length}</b> : null}</motion.button>
                    <motion.button type="button" data-active={imagePanel === "style" || Boolean(selectedStyle) ? "true" : "false"} onClick={() => setImagePanel((current) => current === "style" ? null : "style")} whileTap={{ scale: 0.96 }}><SlidersHorizontal /> Fotoğraf tarzı{selectedStyle ? <Check /> : null}</motion.button>
                  </div></div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  {imagePanel === "products" ? (
                    <motion.section key="products" className={styles.subPanel} initial={{ opacity: 0, height: 0, y: 6 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: 4 }} transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}>
                      <div className={styles.subPanelHeader}><div><strong>Ürün ekle</strong><span>Görselde kullanmak istediğin ürünleri seç</span></div><button type="button" onClick={() => setImagePanel(null)} aria-label="Ürün seçiciyi kapat"><X /></button></div>
                      <label className={styles.productSearch}><Search /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Ürün ara…" autoFocus /></label>
                      {selectedProducts.length ? <div className={styles.selectedProducts}>{selectedProducts.map((product) => <motion.button layout key={product.id} type="button" onClick={() => toggleProduct(product)} whileTap={{ scale: 0.96 }}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Package />}<span>{product.name}</span><X /></motion.button>)}</div> : null}
                      <div className={styles.productGrid}>
                        {productsLoading ? <div className={styles.panelState}><LoaderCircle className={styles.spin} /> Ürünler yükleniyor…</div> : productError && !products.length ? <div className={styles.panelState}>{productError}</div> : products.map((product) => {
                          const active = selectedProducts.some((item) => item.id === product.id);
                          return <motion.button key={product.id} type="button" className={styles.productCard} data-active={active ? "true" : "false"} onClick={() => toggleProduct(product)} whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }}>
                            <span className={styles.productImage}>{product.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <Package />}{active ? <i><Check /></i> : null}</span>
                            <span className={styles.productMeta}><strong>{product.name}</strong><small>{[formatPrice(product), product.stockStatus].filter(Boolean).join(" · ")}</small></span>
                          </motion.button>;
                        })}
                        {!productsLoading && !products.length && !productError ? <div className={styles.panelState}>Ürün bulunamadı.</div> : null}
                      </div>
                      {productError && products.length ? <div className={styles.inlineError}>{productError}</div> : null}
                    </motion.section>
                  ) : imagePanel === "style" ? (
                    <motion.section key="style" className={styles.subPanel} initial={{ opacity: 0, height: 0, y: 6 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: 4 }} transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}>
                      <div className={styles.subPanelHeader}><div><strong>Fotoğraf tarzı</strong><span>Başlığa dokun, alt tarzı seç</span></div><button type="button" onClick={() => setImagePanel(null)} aria-label="Fotoğraf tarzını kapat"><X /></button></div>
                      <div className={styles.styleScroll}>
                        {STYLE_GROUPS.map((group) => {
                          const open = expandedStyle === group.id;
                          const selected = selectedStyle?.groupId === group.id;
                          return <div className={styles.accordion} key={group.id} data-selected={selected ? "true" : "false"}>
                            <motion.button type="button" className={styles.accordionTrigger} onClick={() => setExpandedStyle((current) => current === group.id ? null : group.id)} whileTap={{ scale: 0.992 }}>
                              <span><strong>{group.label}</strong><small>{selected ? selectedStyle?.option : group.description}</small></span>
                              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}><ChevronDown /></motion.span>
                            </motion.button>
                            <AnimatePresence initial={false}>
                              {open ? <motion.div className={styles.accordionBody} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.19 }}><div>{group.options.map((option) => <motion.button key={option} type="button" data-active={selectedStyle?.groupId === group.id && selectedStyle.option === option ? "true" : "false"} onClick={() => chooseStyle(group, option)} whileTap={{ scale: 0.96 }}>{selectedStyle?.groupId === group.id && selectedStyle.option === option ? <Check /> : null}{option}</motion.button>)}</div></motion.div> : null}
                            </AnimatePresence>
                          </div>;
                        })}

                        <div className={styles.fineTuneTitle}><Sparkles /> İnce ayarlar</div>
                        {EXTRA_GROUPS.map((group) => {
                          const open = expandedExtra === group.id;
                          const value = extras[group.id];
                          return <div className={styles.accordion} key={group.id} data-selected={value ? "true" : "false"}>
                            <motion.button type="button" className={styles.accordionTrigger} onClick={() => setExpandedExtra((current) => current === group.id ? null : group.id)} whileTap={{ scale: 0.992 }}><span><strong>{group.label}</strong><small>{value || "Seçim yap"}</small></span><motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}><ChevronDown /></motion.span></motion.button>
                            <AnimatePresence initial={false}>{open ? <motion.div className={styles.accordionBody} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.19 }}><div>{group.options.map((option) => <motion.button key={option} type="button" data-active={value === option ? "true" : "false"} onClick={() => setExtra(group.id, option)} whileTap={{ scale: 0.96 }}>{value === option ? <Check /> : null}{option}</motion.button>)}</div></motion.div> : null}</AnimatePresence>
                          </div>;
                        })}
                      </div>
                    </motion.section>
                  ) : null}
                </AnimatePresence>

                {(selectedProducts.length || selectedStyle) && !imagePanel ? <motion.div className={styles.selectionSummary} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                  {selectedProducts.length ? <span><Package /> {selectedProducts.length} ürün</span> : null}
                  {selectedStyle ? <span><SlidersHorizontal /> {selectedStyle.groupLabel} · {selectedStyle.option}</span> : null}
                </motion.div> : null}

                {imageError ? <motion.div className={styles.inlineError} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{imageError}</motion.div> : null}

                <AnimatePresence mode="wait" initial={false}>
                  {imageStage === "quote" && quote ? (
                    <motion.div key="quote" className={styles.quoteBar} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
                      <div><span>Tahmini görsel ücreti</span><strong>{formatUsd(quote.estimatedUsd)}</strong><small>{QUALITY_LABELS[quote.quality]} · {SIZE_LABELS[quote.size]}{quote.referenceCount ? ` · ${quote.referenceCount} ürün referansı` : ""}</small></div>
                      <div className={styles.quoteActions}><motion.button type="button" className={styles.cancelButton} onClick={() => { setQuote(null); setImageStage("idle"); }} whileTap={{ scale: 0.96 }}>İptal</motion.button><motion.button type="button" className={styles.confirmButton} onClick={() => void confirmGeneration()} whileTap={{ scale: 0.96 }}><Check /> Kabul et ve üret</motion.button></div>
                    </motion.div>
                  ) : imageStage === "generating" ? (
                    <motion.div key="generating" className={styles.generatingBar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LoaderCircle className={styles.spin} /><span>ROSTA Insight fotoğrafı üretiyor. Seçili ürün referansları korunuyor.</span><motion.i initial={{ x: "-100%" }} animate={{ x: "250%" }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} /></motion.div>
                  ) : (
                    <motion.div key="idle" className={styles.dockActions} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span>Önce fiyat gösterilir. Sen onaylamadan ücretli üretim başlamaz.</span><motion.button type="button" onClick={() => void requestQuote()} disabled={imageStage === "quoting"} whileTap={{ scale: 0.96 }}>{imageStage === "quoting" ? <><LoaderCircle className={styles.spin} /> Hesaplanıyor</> : <><Sparkles /> Fiyatı göster</>}</motion.button></motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {menuMode ? (
              <motion.div data-ruthie-composer-enhancer-menu className={styles.commandMenu} style={{ bottom: `calc(100% + ${menuOffset}px)` }} initial={{ opacity: 0, y: 10, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 7, scale: 0.985 }} transition={{ duration: 0.19, ease: [0.32, 0.72, 0, 1] }}>
                <div className={styles.commandHeader}>{menuMode === "at" ? <><span className={styles.atMark}>@</span><span>ROSTA Insight araçları</span></> : <span>Ekle ve oluştur</span>}</div>
                <div className={styles.commandItems}>{menuItems.map((item) => { const Icon = item.icon; return <motion.button type="button" key={item.id} onClick={() => chooseMenuItem(item.id)} whileHover={{ x: 2 }} whileTap={{ scale: 0.985 }}><span className={styles.commandIcon}><Icon /></span><span className={styles.commandCopy}><strong>{item.label}</strong><small>{item.detail}</small></span>{item.id === "generate" ? <span className={styles.commandShortcut}>@fotoğrafüret</span> : null}</motion.button>; })}{!menuItems.length ? <div className={styles.commandEmpty}>Bu @ komutuyla eşleşen araç yok.</div> : null}</div>
                <div className={styles.commandFooter}>Mesaj alanına <b>@</b> yaz veya <b>@fotoğrafüret</b> yaz.</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>,
        targets.composer,
      )}

      {createPortal(<AnimatePresence>{toast ? <motion.div className={styles.toast} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}><ImageIcon /><span>{toast}</span>{generated && actualCost != null ? <small>{formatUsd(actualCost)}</small> : null}</motion.div> : null}</AnimatePresence>, document.body)}
    </>
  );
}
