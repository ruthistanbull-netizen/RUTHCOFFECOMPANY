"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Megaphone,
  Package,
  Paperclip,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Pressable, useOverlayBehavior } from "@ruth-commerce/ui";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";
import { ExactIconButton } from "./primitives";

export type RuthieInsightAutoPrompt = {
  id: number;
  text: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  imageDataUrl?: string;
  attachmentNames?: string[];
};

type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  capabilities?: { chat?: boolean };
};

type ChatPayload = {
  ok?: boolean;
  response?: { text?: string };
  error?: { message?: string } | string;
};

type PendingAttachment = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
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

type ExtraKey = "framing" | "background" | "lighting" | "usage";
type ExtraSelections = Record<ExtraKey, string>;
type ImagePurpose = "" | "Instagram Post" | "Instagram Hikaye" | "Meta Reklamı";
type ImageSheet = "products" | "style" | null;
type ImageQuality = "low" | "medium" | "high";
type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
type ImageStage = "idle" | "quoting" | "quote" | "generating";

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
const MAX_ATTACHMENTS = 4;
const MAX_PRODUCTS = 6;
const FILE_ACCEPT = "image/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const QUALITY_LABELS: Record<ImageQuality, string> = { low: "Düşük", medium: "Orta", high: "Yüksek" };
const SIZE_LABELS: Record<ImageSize, string> = {
  "1024x1024": "Kare",
  "1024x1536": "Dikey",
  "1536x1024": "Yatay",
};

const PURPOSES: Array<{ value: Exclude<ImagePurpose, "">; title: string; detail: string }> = [
  { value: "Instagram Post", title: "Instagram Post", detail: "Feed · kare" },
  { value: "Instagram Hikaye", title: "Instagram Hikaye", detail: "Story · dikey" },
  { value: "Meta Reklamı", title: "Meta Reklamı", detail: "Reklam · CTA" },
];

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
];

const EMPTY_EXTRAS: ExtraSelections = { framing: "", background: "", lighting: "", usage: "" };

const QUICK_PROMPTS = [
  "Bugünkü siparişleri özetle ve dikkat etmem gerekenleri söyle.",
  "Ödemeleri kontrol et; başarısız veya bekleyen işlemleri bul.",
  "Kargo sorunlarını bul ve önce hangisine müdahale etmem gerektiğini söyle.",
  "Bugünkü satış performansını yorumla ve kısa öneriler ver.",
];

function correlationId() {
  return globalThis.crypto?.randomUUID?.() || `ruthie-insight-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function formatProductPrice(product: ProductRef) {
  if (product.price == null || !Number.isFinite(product.price)) return "";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: product.currency || "TRY", maximumFractionDigits: 0 }).format(product.price);
  } catch {
    return `${product.price} ${product.currency || "TRY"}`;
  }
}

function readFile(file: File): Promise<PendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: id("attachment"), name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`));
    reader.readAsDataURL(file);
  });
}

function promptWithoutImageCommand(value: string) {
  return value.replace(/@Fotoğraf\s+üret/gi, "").replace(/\s+/g, " ").trim();
}

function replaceAtToken(value: string, cursor: number, replacement: string) {
  const before = value.slice(0, cursor);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  if (!match || match.index == null) {
    const prefix = value.trim() ? `${value.trimEnd()} ` : "";
    return { value: `${prefix}${replacement} `, caret: `${prefix}${replacement} `.length };
  }
  const tokenStart = match.index + (match[1] ? match[1].length : 0);
  const head = value.slice(0, tokenStart);
  const tail = value.slice(cursor);
  const spacer = head && !head.endsWith(" ") ? " " : "";
  const next = `${head}${spacer}${replacement} ${tail}`.replace(/\s{2,}/g, " ");
  const replacementIndex = next.indexOf(replacement, tokenStart);
  return { value: next, caret: Math.min(replacementIndex + replacement.length + 1, next.length) };
}

function InsightPickerSheet({
  open,
  onClose,
  triggerRef,
  title,
  subtitle,
  width = 420,
  children,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  title: string;
  subtitle: string;
  width?: number;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 80, width });

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const isMobile = window.innerWidth < 768;
      setMobile(isMobile);
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || isMobile) return;
      const nextWidth = Math.min(width, window.innerWidth - 24);
      const left = Math.max(12, Math.min(window.innerWidth - nextWidth - 12, rect.left));
      const estimatedHeight = Math.min(620, window.innerHeight - 32);
      const below = rect.bottom + 8;
      const top = below + estimatedHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - estimatedHeight - 8);
      setPosition({ left, top, width: nextWidth });
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, triggerRef, width]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[2147483646]">
          <motion.button
            type="button"
            aria-label={`${title} penceresini kapat`}
            onClick={onClose}
            className="absolute inset-0 bg-black/10 md:bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={mobile ? { y: "100%", opacity: 0 } : { y: -8, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={mobile ? { y: "100%", opacity: 0 } : { y: -5, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 32, mass: 0.72 }}
            className={mobile
              ? "fixed inset-x-0 bottom-0 z-[2147483647] max-h-[82dvh] overflow-hidden rounded-t-[28px] border border-border-subtle bg-surface-primary px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 shadow-overlay"
              : "fixed z-[2147483647] max-h-[min(76dvh,620px)] overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary p-3 shadow-overlay"}
            style={mobile ? undefined : { left: position.left, top: position.top, width: position.width }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong md:hidden" />
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <div className="min-w-0">
                <p className="ruth-type-card-title truncate text-main">{title}</p>
                <p className="ruth-type-caption mt-0.5 text-muted">{subtitle}</p>
              </div>
              <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-surface-secondary" aria-label="Kapat"><X className="h-4 w-4" /></button>
            </div>
            {children}
          </motion.section>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function ExactRuthieInsightPopup({
  open,
  onClose,
  autoPrompt,
}: {
  open: boolean;
  onClose: () => void;
  autoPrompt?: RuthieInsightAutoPrompt | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [providerChecked, setProviderChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [imageSelected, setImageSelected] = useState(false);
  const [quality, setQuality] = useState<ImageQuality>("medium");
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [imageStage, setImageStage] = useState<ImageStage>("idle");
  const [quote, setQuote] = useState<ImageQuote | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSheet, setImageSheet] = useState<ImageSheet>(null);
  const [purpose, setPurpose] = useState<ImagePurpose>("");
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductRef[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<ProductRef[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StyleSelection | null>(null);
  const [expandedStyle, setExpandedStyle] = useState<string | null>(STYLE_GROUPS[0]?.id || null);
  const [expandedExtra, setExpandedExtra] = useState<ExtraKey | null>(null);
  const [extras, setExtras] = useState<ExtraSelections>(EMPTY_EXTRAS);
  const messagesRef = useRef<ChatMessage[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastAutoPromptRef = useRef<number | null>(null);
  const productTriggerRef = useRef<HTMLButtonElement | null>(null);
  const styleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const overlay = useOverlayBehavior({ active: open, onClose, dismissalPolicy: "light-dismiss" });

  const invalidateImageQuote = useCallback(() => {
    setQuote(null);
    setImageStage((current) => current === "generating" ? current : "idle");
    setImageError(null);
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProviderChecked(false);
    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/ruthie/openai/status", { headers, cache: "no-store" });
        const payload = await response.json().catch(() => null) as ProviderStatus | null;
        if (cancelled) return;
        const ready = Boolean(response.ok && payload?.ok && payload.configured && payload.capabilities?.chat);
        setProviderReady(ready);
        setError(ready ? null : "ROSTA Insight şu anda sohbete hazır değil.");
      } catch {
        if (!cancelled) {
          setProviderReady(false);
          setError("ROSTA Insight bağlantı durumu alınamadı.");
        }
      } finally {
        if (!cancelled) setProviderChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? "smooth" : "auto", block: "end" });
  }, [messages.length, open, sending]);

  useEffect(() => {
    if (!toolsOpen && !mentionOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (composerRef.current?.contains(event.target as Node)) return;
      setToolsOpen(false);
      setMentionOpen(false);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setToolsOpen(false);
        setMentionOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [mentionOpen, toolsOpen]);

  useEffect(() => {
    if (!imageSelected || imageSheet !== "products") return;
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
          setProducts(payload.products.slice(0, 40).map((product: any): ProductRef => ({
            id: String(product.id),
            name: String(product.name || "Ürün"),
            imageUrl: typeof product.main_image_url === "string" ? product.main_image_url : null,
            price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
            currency: String(product.currency || "TRY"),
            stockStatus: product.stock_status ? String(product.stock_status) : null,
          })));
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
  }, [imageSelected, imageSheet, productQuery]);

  const mentionItems = useMemo(() => {
    const items = [
      { id: "attach", label: "Fotoğraf veya dosya ekle", detail: "Görsel, PDF, Word, Excel ve daha fazlası", icon: Paperclip },
      { id: "generate", label: "Fotoğraf üret", detail: "Ürün, tarz, kullanım amacı, kalite ve boyutu seç", icon: WandSparkles },
    ];
    const query = mentionQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) return items;
    return items.filter((item) => `${item.label} ${item.detail}`.toLocaleLowerCase("tr-TR").includes(query));
  }, [mentionQuery]);

  const generationContext = useMemo(() => ({
    productIds: selectedProducts.map((item) => item.id),
    style: {
      purpose,
      category: selectedStyle?.groupLabel || "",
      variant: selectedStyle?.option || "",
      framing: extras.framing,
      background: extras.background,
      lighting: extras.lighting,
      usage: extras.usage,
      platform: purpose,
    },
  }), [extras, purpose, selectedProducts, selectedStyle]);

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).slice(0, MAX_ATTACHMENTS - attachments.length);
    event.target.value = "";
    if (!selected.length) return;
    try {
      const next = await Promise.all(selected.map(readFile));
      setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dosya eklenemedi.");
    }
  };

  const chooseTool = useCallback((tool: "attach" | "generate") => {
    setToolsOpen(false);
    setMentionOpen(false);
    if (tool === "attach") {
      const textarea = inputRef.current;
      if (textarea && /(^|\s)@([^\s@]*)$/.test(input.slice(0, textarea.selectionStart ?? input.length))) {
        const cursor = textarea.selectionStart ?? input.length;
        const before = input.slice(0, cursor);
        const match = /(^|\s)@([^\s@]*)$/.exec(before);
        if (match && match.index != null) {
          const tokenStart = match.index + (match[1] ? match[1].length : 0);
          setInput(`${input.slice(0, tokenStart)}${input.slice(cursor)}`.replace(/\s{2,}/g, " "));
        }
      }
      fileInputRef.current?.click();
      return;
    }

    const textarea = inputRef.current;
    const cursor = textarea?.selectionStart ?? input.length;
    const next = replaceAtToken(input, cursor, IMAGE_COMMAND);
    setInput(next.value);
    setImageSelected(true);
    setQuote(null);
    setImageStage("idle");
    setImageError(null);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    }, 20);
  }, [input]);

  const send = useCallback(async (forcedText?: string) => {
    const rawText = String(forcedText ?? input).trim();
    if (imageSelected && !forcedText) return;
    const text = rawText || (attachments.length ? "Eklediğim dosyaları incele." : "");
    if (!text || !providerReady || sending) return;

    const userMessage: ChatMessage = {
      role: "user",
      text,
      attachmentNames: attachments.map((item) => item.name),
    };
    const outgoing = [...messagesRef.current, userMessage].slice(-16);
    messagesRef.current = outgoing;
    setMessages(outgoing);
    const outgoingAttachments = attachments.map(({ name, type, dataUrl }) => ({ name, mimeType: type, dataUrl }));
    setInput("");
    setAttachments([]);
    setError(null);
    setSending(true);

    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/chat", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json", "x-correlation-id": correlationId() },
        body: JSON.stringify({
          messages: outgoing.map((message) => ({ role: message.role, text: message.text })),
          attachments: outgoingAttachments,
        }),
      });
      const payload = await response.json().catch(() => null) as ChatPayload | null;
      const reply = payload?.response?.text?.trim();
      if (!response.ok || !payload?.ok || !reply) {
        const apiError = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
        throw new Error(apiError || "ROSTA Insight yanıt veremedi.");
      }
      const completed = [...outgoing, { role: "assistant" as const, text: reply }].slice(-16);
      messagesRef.current = completed;
      setMessages(completed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      setSending(false);
    }
  }, [attachments, imageSelected, input, providerReady, sending]);

  const requestImageQuote = useCallback(async () => {
    if (imageStage === "quoting" || imageStage === "generating") return;
    const rawPrompt = promptWithoutImageCommand(input);
    const prompt = rawPrompt || (selectedProducts.length || selectedStyle || purpose ? "Seçili ürün ve fotoğraf ayarlarına göre premium bir görsel oluştur." : "");
    if (!prompt) {
      setImageError("Nasıl bir görsel istediğini yaz veya ürün/fotoğraf tarzı seç.");
      return;
    }
    setImageStage("quoting");
    setQuote(null);
    setImageError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/image-v3", {
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
  }, [generationContext, imageStage, input, purpose, quality, selectedProducts.length, selectedStyle, size]);

  const confirmImageGeneration = async () => {
    if (!quote || imageStage === "generating") return;
    const rawPrompt = promptWithoutImageCommand(input);
    const prompt = rawPrompt || "Seçili ürün ve fotoğraf ayarlarına göre premium bir görsel oluştur.";
    setImageStage("generating");
    setImageError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/image-v3", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, quality, size, ...generationContext, quoteToken: quote.token, confirmed: true }),
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || !payload?.ok || !payload?.image?.dataUrl) throw new Error(payload?.error || "Görsel üretilemedi.");
      const image = payload.image as GeneratedImage;
      const actual = typeof payload?.cost?.actualUsd === "number" ? payload.cost.actualUsd : null;
      const assistantMessage: ChatMessage = {
        role: "assistant",
        text: `Fotoğraf üretildi${actual != null ? ` · gerçek API maliyeti ${formatUsd(actual)}` : ""}.`,
        imageDataUrl: image.dataUrl,
      };
      const completed = [...messagesRef.current, assistantMessage].slice(-16);
      messagesRef.current = completed;
      setMessages(completed);
      setInput((current) => current.replace(/@Fotoğraf\s+üret/gi, "").replace(/\s{2,}/g, " ").trimStart());
      setImageSelected(false);
      setQuote(null);
      setImageStage("idle");
      setImageError(null);
      setImageSheet(null);
      setPurpose("");
      setSelectedProducts([]);
      setSelectedStyle(null);
      setExtras(EMPTY_EXTRAS);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } catch (caught) {
      setImageError(caught instanceof Error ? caught.message : "Görsel üretilemedi.");
      setImageStage("quote");
    }
  };

  useEffect(() => {
    if (!open || !providerReady || !autoPrompt || sending) return;
    if (lastAutoPromptRef.current === autoPrompt.id) return;
    lastAutoPromptRef.current = autoPrompt.id;
    void send(autoPrompt.text);
  }, [autoPrompt, open, providerReady, send, sending]);

  const onInputChange = (value: string) => {
    setInput(value);
    const textarea = inputRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (match) {
      setMentionOpen(true);
      setToolsOpen(false);
      setMentionQuery(match[2] || "");
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
    const hasImageCommand = /@Fotoğraf\s+üret/i.test(value);
    if (hasImageCommand && !imageSelected) setImageSelected(true);
    if (!hasImageCommand && imageSelected) {
      setImageSelected(false);
      setImageSheet(null);
      setQuote(null);
      setImageStage("idle");
      setImageError(null);
    }
  };

  const cancelImageMode = () => {
    if (imageStage === "generating") return;
    setInput((current) => current.replace(/@Fotoğraf\s+üret/gi, "").replace(/\s{2,}/g, " ").trimStart());
    setImageSelected(false);
    setImageSheet(null);
    setQuote(null);
    setImageStage("idle");
    setImageError(null);
    setPurpose("");
    setSelectedProducts([]);
    setSelectedStyle(null);
    setExtras(EMPTY_EXTRAS);
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
    invalidateImageQuote();
  };

  const chooseStyle = (group: StyleGroup, option: string) => {
    setSelectedStyle({ groupId: group.id, groupLabel: group.label, option });
    invalidateImageQuote();
  };

  const setExtra = (key: ExtraKey, value: string) => {
    setExtras((current) => ({ ...current, [key]: current[key] === value ? "" : value }));
    invalidateImageQuote();
  };

  const choosePurpose = (value: Exclude<ImagePurpose, "">) => {
    const next = purpose === value ? "" : value;
    setPurpose(next);
    if (next === "Instagram Post") setSize("1024x1024");
    if (next === "Instagram Hikaye" || next === "Meta Reklamı") setSize("1024x1536");
    invalidateImageQuote();
  };

  const onComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionItems.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((current) => (current + 1) % mentionItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((current) => (current - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const item = mentionItems[mentionIndex];
        if (item) chooseTool(item.id as "attach" | "generate");
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (imageSelected) void requestImageQuote();
      else void send();
    }
  };

  const primaryAction = () => {
    if (imageSelected) void requestImageQuote();
    else void send();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 flex items-end justify-center md:items-center md:p-4" style={{ zIndex: 2147483600 }}>
            <motion.button
              type="button"
              aria-label="ROSTA Insight sohbetini kapat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={overlay.onBackdropClick}
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            />

            <motion.section
              ref={overlay.containerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ruthie-insight-popup-title"
              data-ruthie-insight-popup="true"
              data-dismissal-policy={overlay.dismissalPolicy}
              tabIndex={-1}
              initial={{ y: 36, opacity: 0, scale: 0.99 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 28, opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="relative flex max-h-[calc(100dvh-4.75rem)] w-full flex-col overflow-hidden rounded-t-[var(--radius-container)] bg-surface-primary shadow-overlay md:h-[min(78vh,680px)] md:w-[min(86vw,960px)] md:rounded-[var(--radius-card)]"
            >
              <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] text-white shadow-floating">
                  <RuthieBrandIcon size={22} />
                  <span className="absolute inset-[-3px] rounded-full border border-accent/25" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 id="ruthie-insight-popup-title" className="ruth-type-card-title text-main">ROSTA Insight</h2>
                    <span className="inline-flex items-center gap-1 text-[10px] text-success-foreground"><span className={`h-1.5 w-1.5 rounded-full ${providerReady ? "bg-success" : "bg-subtle"}`} />{providerReady ? "hazır" : providerChecked ? "çevrimdışı" : "bağlanıyor"}</span>
                  </div>
                  <p className="ruth-type-caption mt-0.5 text-muted">Panel hakkında sor, dosya ekle veya @ ile araç seç</p>
                </div>
                <ExactIconButton icon={X} label="Kapat" variant="ghost" size="icon-sm" onClick={onClose} data-autofocus />
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {!messages.length ? (
                  <div className="flex min-h-52 flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent"><RuthieBrandIcon size={27} /></div>
                    <p className="ruth-type-card-title text-main">ROSTA Insight’a ne sormak istiyorsun?</p>
                    <p className="ruth-type-caption mt-1 max-w-sm text-muted">Siparişleri, ödemeleri, kargoyu konuşabilir; fotoğraf veya dosya ekleyebilirsin.</p>
                    <div className="mt-4 grid w-full max-w-md gap-2 sm:grid-cols-2">
                      {QUICK_PROMPTS.map((prompt, index) => (
                        <motion.button key={prompt} type="button" disabled={!providerReady || sending} onClick={() => void send(prompt)} whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="min-h-10 rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-3 py-2 text-left text-[10px] font-semibold leading-4 text-main transition-colors hover:border-accent/30 hover:bg-accent-soft hover:text-accent disabled:opacity-50">{index === 0 ? "Siparişleri özetle" : index === 1 ? "Ödemeleri kontrol et" : index === 2 ? "Kargo sorunlarını bul" : "Satışları yorumla"}</motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message, index) => (
                      <motion.div key={`${message.role}-${index}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={message.role === "user" ? "max-w-[88%] rounded-[18px] rounded-br-[6px] bg-accent px-3.5 py-2.5 text-sm leading-relaxed text-accent-foreground" : "max-w-[92%] rounded-[18px] rounded-bl-[6px] bg-surface-secondary px-3.5 py-2.5 text-sm leading-relaxed text-main"}>
                          {message.role === "assistant" ? <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-accent"><RuthieBrandIcon size={13} /> ROSTA Insight</div> : null}
                          {message.imageDataUrl ? <motion.img src={message.imageDataUrl} alt="ROSTA Insight tarafından üretilen fotoğraf" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mb-2 max-h-[360px] w-auto max-w-full rounded-xl object-contain" /> : null}
                          <p className="whitespace-pre-wrap">{message.text}</p>
                          {message.attachmentNames?.length ? <div className="mt-2 flex flex-wrap gap-1">{message.attachmentNames.map((name) => <span key={name} className="rounded-full bg-black/10 px-2 py-1 text-[9px]">{name}</span>)}</div> : null}
                        </div>
                      </motion.div>
                    ))}
                    {sending ? <div className="flex justify-start"><motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-[18px] rounded-bl-[6px] bg-surface-secondary px-3.5 py-2.5 text-xs text-muted">ROSTA Insight yazıyor…</motion.div></div> : null}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {error ? <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mx-4 mb-2 shrink-0 radius-small bg-danger-soft px-3 py-2 ruth-type-caption text-danger-foreground">{error}</motion.div> : null}

              <div ref={composerRef} className="relative shrink-0 border-t border-border-subtle bg-surface-primary px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <input ref={fileInputRef} hidden type="file" multiple accept={FILE_ACCEPT} onChange={(event) => void addFiles(event)} />

                <AnimatePresence initial={false}>
                  {attachments.length ? (
                    <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} className="mb-2 flex max-w-full gap-2 overflow-x-auto pb-1">
                      {attachments.map((file) => (
                        <motion.div key={file.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex min-w-[150px] max-w-[210px] items-center gap-2 rounded-xl border border-border-subtle bg-surface-secondary p-1.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-primary text-muted">{file.type.startsWith("image/") ? <img src={file.dataUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-4 w-4" />}</div>
                          <div className="min-w-0 flex-1"><p className="truncate text-[9px] font-semibold text-main">{file.name}</p><span className="text-[8px] text-muted">{file.type.startsWith("image/") ? "Fotoğraf" : "Dosya"}</span></div>
                          <motion.button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} whileTap={{ scale: 0.86 }} className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-primary hover:text-main"><X className="h-3 w-3" /></motion.button>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence initial={false}>
                  {imageSelected ? (
                    <motion.div initial={{ opacity: 0, y: 8, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: 0.18 }} className="mb-2 rounded-2xl border border-accent/20 bg-accent-soft/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-accent/20 bg-surface-primary px-2.5 text-[9px] font-semibold text-accent"><WandSparkles className="h-3 w-3" />{IMAGE_COMMAND}<motion.button type="button" onClick={cancelImageMode} whileTap={{ scale: 0.84 }} className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-accent-soft"><X className="h-2.5 w-2.5" /></motion.button></span>
                        <span className="text-[8px] text-muted">{imageStage === "quoting" ? "Fiyat hesaplanıyor…" : imageStage === "generating" ? "Üretiliyor…" : "Ayarlarını seç"}</span>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div><span className="mb-1 block text-[8px] font-semibold text-muted">Kalite</span><div className="flex flex-wrap gap-1">{(Object.keys(QUALITY_LABELS) as ImageQuality[]).map((item) => <motion.button key={item} type="button" onClick={() => { setQuality(item); invalidateImageQuote(); }} whileTap={{ scale: 0.95 }} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[8px] ${quality === item ? "border-accent/30 bg-accent text-accent-foreground" : "border-border-subtle bg-surface-primary text-muted"}`}>{quality === item ? <Check className="h-2.5 w-2.5" /> : null}{QUALITY_LABELS[item]}</motion.button>)}</div></div>
                        <div><span className="mb-1 block text-[8px] font-semibold text-muted">Boyut</span><div className="flex flex-wrap gap-1">{(Object.keys(SIZE_LABELS) as ImageSize[]).map((item) => <motion.button key={item} type="button" onClick={() => { setSize(item); invalidateImageQuote(); }} whileTap={{ scale: 0.95 }} className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[8px] ${size === item ? "border-accent/30 bg-accent text-accent-foreground" : "border-border-subtle bg-surface-primary text-muted"}`}>{size === item ? <Check className="h-2.5 w-2.5" /> : null}{SIZE_LABELS[item]}</motion.button>)}</div></div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button ref={productTriggerRef} type="button" onClick={() => setImageSheet("products")} className={`ruth-type-control flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left transition ${selectedProducts.length ? "border-accent/30 bg-accent-soft text-accent" : "border-border-subtle bg-surface-secondary text-main hover:border-border-strong"}`}>
                          <span className="flex min-w-0 items-center gap-2"><Package className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Ürün ekle</span></span>
                          <span className="shrink-0 text-[8px] text-muted">{selectedProducts.length ? `${selectedProducts.length} seçili` : "Seç"}</span>
                        </button>
                        <button ref={styleTriggerRef} type="button" onClick={() => setImageSheet("style")} className={`ruth-type-control flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 text-left transition ${selectedStyle ? "border-accent/30 bg-accent-soft text-accent" : "border-border-subtle bg-surface-secondary text-main hover:border-border-strong"}`}>
                          <span className="flex min-w-0 items-center gap-2"><SlidersHorizontal className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">Fotoğraf tarzı</span></span>
                          <span className="max-w-[44%] shrink-0 truncate text-[8px] text-muted">{selectedStyle?.option || "Seç"}</span>
                        </button>
                      </div>

                      <div className="mt-2">
                        <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold text-muted"><Megaphone className="h-3 w-3" />Ne için üretilecek?</span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {PURPOSES.map((item) => {
                            const active = purpose === item.value;
                            return <motion.button key={item.value} type="button" onClick={() => choosePurpose(item.value)} whileTap={{ scale: 0.97 }} className={`min-w-0 rounded-xl border px-2 py-2 text-left transition ${active ? "border-accent/30 bg-accent text-accent-foreground shadow-sm" : "border-border-subtle bg-surface-primary text-main hover:border-accent/20"}`}><strong className="block truncate text-[8px] font-semibold">{item.title}</strong><span className={`mt-0.5 block truncate text-[7px] ${active ? "text-accent-foreground/75" : "text-muted"}`}>{item.detail}</span></motion.button>;
                          })}
                        </div>
                      </div>

                      {(selectedProducts.length || selectedStyle || purpose) ? <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex flex-wrap gap-1.5">
                        {selectedProducts.length ? <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border-subtle bg-surface-primary px-2 text-[8px] text-muted"><Package className="h-3 w-3 text-accent" />{selectedProducts.length} ürün</span> : null}
                        {selectedStyle ? <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface-primary px-2 text-[8px] text-muted"><SlidersHorizontal className="h-3 w-3 shrink-0 text-accent" /><span className="truncate">{selectedStyle.groupLabel} · {selectedStyle.option}</span></span> : null}
                        {purpose ? <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border-subtle bg-surface-primary px-2 text-[8px] text-muted"><Megaphone className="h-3 w-3 text-accent" />{purpose}</span> : null}
                      </motion.div> : null}

                      {imageError ? <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-lg bg-danger-soft px-2.5 py-2 text-[8px] text-danger-foreground">{imageError}</motion.div> : null}

                      <AnimatePresence mode="wait" initial={false}>
                        {imageStage === "quote" && quote ? (
                          <motion.div key="quote" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
                            <div className="flex flex-wrap items-baseline gap-2"><span className="text-[8px] text-muted">Tahmini ücret</span><strong className="text-sm text-main">{formatUsd(quote.estimatedUsd)}</strong><small className="text-[8px] text-muted">1 fotoğraf · {QUALITY_LABELS[quote.quality]} · {SIZE_LABELS[quote.size]}{quote.referenceCount ? ` · ${quote.referenceCount} ürün` : ""}</small></div>
                            <div className="flex gap-1.5"><motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => { setQuote(null); setImageStage("idle"); }} className="h-8 rounded-lg border border-border-subtle bg-surface-primary px-3 text-[8px] text-muted">İptal</motion.button><motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => void confirmImageGeneration()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[8px] font-semibold text-accent-foreground"><Check className="h-3 w-3" />Kabul et ve üret</motion.button></div>
                          </motion.div>
                        ) : imageStage === "generating" ? (
                          <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative mt-2 flex min-h-9 items-center gap-2 overflow-hidden border-t border-border-subtle pt-2 text-[8px] text-muted"><LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />ROSTA Insight fotoğrafı üretiyor. Seçili ürün referansları korunuyor.<motion.i className="absolute bottom-0 left-0 h-0.5 w-1/3 bg-accent" initial={{ x: "-100%" }} animate={{ x: "320%" }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} /></motion.div>
                        ) : (
                          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2"><span className="text-[8px] leading-4 text-muted">Gönder’e basınca önce fiyat gösterilir. Onay vermeden ücretli üretim başlamaz.</span><motion.button type="button" whileTap={{ scale: 0.95 }} onClick={() => void requestImageQuote()} disabled={imageStage === "quoting"} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-surface-primary px-3 text-[8px] font-semibold text-main shadow-sm disabled:opacity-50">{imageStage === "quoting" ? <><LoaderCircle className="h-3 w-3 animate-spin" />Hesaplanıyor</> : <><Sparkles className="h-3 w-3" />Fiyatı göster</>}</motion.button></motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="relative rounded-[18px] border border-border-subtle bg-surface-secondary p-2 transition-shadow focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/10">
                  <AnimatePresence>
                    {(toolsOpen || mentionOpen) ? (
                      <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: 0.16 }} className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(360px,calc(100vw-38px))] overflow-hidden rounded-2xl border border-border-subtle bg-surface-primary shadow-overlay">
                        <div className="flex min-h-10 items-center gap-2 px-3 text-[9px] font-semibold text-muted">{mentionOpen ? <><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-xs font-bold text-accent">@</span>ROSTA Insight araçları</> : "Ekle ve oluştur"}</div>
                        <div className="space-y-1 p-1.5 pt-0">
                          {(mentionOpen ? mentionItems : [
                            { id: "attach", label: "Fotoğraf veya dosya ekle", detail: "Görsel, PDF, Word, Excel ve daha fazlası", icon: Paperclip },
                            { id: "generate", label: "Fotoğraf üret", detail: "Ürün, tarz, kullanım amacı, kalite ve boyutu seç", icon: WandSparkles },
                          ]).map((item, index) => {
                            const Icon = item.icon;
                            const active = mentionOpen && index === mentionIndex;
                            return <motion.button key={item.id} type="button" onClick={() => chooseTool(item.id as "attach" | "generate")} whileHover={{ x: 2 }} whileTap={{ scale: 0.985 }} className={`grid w-full grid-cols-[36px_minmax(0,1fr)] items-center gap-2 rounded-xl p-2 text-left ${active ? "bg-accent-soft" : "hover:bg-surface-secondary"}`}><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-secondary text-main"><Icon className="h-4 w-4" /></span><span className="min-w-0"><strong className="block text-[10px] font-semibold text-main">{item.label}</strong><small className="block truncate text-[8px] text-muted">{item.detail}</small></span></motion.button>;
                          })}
                          {mentionOpen && !mentionItems.length ? <div className="px-3 py-5 text-center text-[9px] text-muted">Eşleşen araç yok.</div> : null}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={1}
                    placeholder={providerReady ? "ROSTA Insight’a yaz veya @ ile araç seç…" : "ROSTA Insight hazırlanıyor..."}
                    disabled={!providerReady || sending}
                    className="max-h-28 min-h-9 w-full resize-none bg-transparent px-2 py-2 text-sm text-main outline-none placeholder:text-subtle disabled:opacity-60"
                  />

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => { setToolsOpen((current) => !current); setMentionOpen(false); }} aria-label="Ekle ve oluştur" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-primary hover:text-main"><motion.span animate={{ rotate: toolsOpen ? 45 : 0 }} transition={{ duration: 0.17 }}><Plus className="h-4 w-4" /></motion.span></motion.button>
                      <span className="hidden text-[8px] text-muted sm:inline">@ yazınca araçlar açılır</span>
                    </div>
                    <Pressable type="button" pressStrength="icon" onClick={primaryAction} disabled={!providerReady || sending || imageStage === "generating" || (!input.trim() && !attachments.length && !selectedProducts.length && !selectedStyle && !purpose)} aria-label={imageSelected ? "Görsel fiyatını göster" : "ROSTA Insight’a gönder"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground disabled:opacity-35">{imageStage === "quoting" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : imageSelected ? <Sparkles className="h-4 w-4" /> : <Send className="h-4 w-4" />}</Pressable>
                  </div>
                </div>

                <div className="mt-2 flex justify-end"><Link href="/ruthie/chat" onClick={onClose} className="inline-flex items-center gap-1 text-[10px] font-medium text-muted hover:text-accent">Tam ROSTA Insight sohbetini aç <ExternalLink className="h-3 w-3" /></Link></div>
              </div>
            </motion.section>
          </div>
        ) : null}
      </AnimatePresence>

      <InsightPickerSheet open={open && imageSheet === "products"} onClose={() => setImageSheet(null)} triggerRef={productTriggerRef} title="Ürün ekle" subtitle="Görselde kullanılacak ürünleri seç" width={420}>
        <div className="pt-3">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-secondary px-3 text-muted transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
            <Search className="h-4 w-4 shrink-0" />
            <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Ürün ara…" autoFocus className="min-w-0 flex-1 bg-transparent text-sm text-main outline-none placeholder:text-subtle" />
          </label>

          {selectedProducts.length ? <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {selectedProducts.map((product) => <motion.button layout key={product.id} type="button" onClick={() => toggleProduct(product)} whileTap={{ scale: 0.96 }} className="flex h-8 min-w-max items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft px-1.5 pr-2 text-[8px] text-main">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <Package className="h-3.5 w-3.5" />}<span>{product.name}</span><X className="h-2.5 w-2.5 text-muted" /></motion.button>)}
          </div> : null}

          <div className="mt-2 max-h-[324px] space-y-1.5 overflow-y-auto pr-1">
            {productsLoading ? <div className="flex h-[324px] items-center justify-center gap-2 text-[10px] text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Ürünler yükleniyor…</div> : null}
            {!productsLoading && productError && !products.length ? <div className="flex h-[160px] items-center justify-center px-4 text-center text-[10px] text-danger-foreground">{productError}</div> : null}
            {!productsLoading ? products.map((product) => {
              const active = selectedProducts.some((item) => item.id === product.id);
              return <motion.button key={product.id} type="button" onClick={() => toggleProduct(product)} whileTap={{ scale: 0.985 }} className={`flex h-[60px] w-full items-center gap-3 rounded-xl border p-1.5 text-left transition ${active ? "border-accent/30 bg-accent-soft" : "border-border-subtle bg-surface-secondary hover:border-accent/20"}`}>
                <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-primary text-muted">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <Package className="h-4 w-4" />}{active ? <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-accent text-accent-foreground"><Check className="h-2.5 w-2.5" /></span> : null}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-[10px] font-semibold text-main">{product.name}</strong><small className="mt-1 block truncate text-[8px] text-muted">{[formatProductPrice(product), product.stockStatus].filter(Boolean).join(" · ") || "Ürün"}</small></span>
              </motion.button>;
            }) : null}
            {!productsLoading && !products.length && !productError ? <div className="flex h-[160px] items-center justify-center text-[10px] text-muted">Ürün bulunamadı.</div> : null}
          </div>
          {productError && products.length ? <div className="mt-2 rounded-lg bg-danger-soft px-2.5 py-2 text-[8px] text-danger-foreground">{productError}</div> : null}
          <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3"><span className="text-[9px] text-muted">{selectedProducts.length}/{MAX_PRODUCTS} ürün seçili</span><button type="button" onClick={() => setImageSheet(null)} className="h-9 rounded-xl bg-accent px-4 text-[9px] font-semibold text-accent-foreground">Tamam</button></div>
        </div>
      </InsightPickerSheet>

      <InsightPickerSheet open={open && imageSheet === "style"} onClose={() => setImageSheet(null)} triggerRef={styleTriggerRef} title="Fotoğraf tarzı" subtitle="Başlığa dokun, alt tarzı seç" width={460}>
        <div className="max-h-[min(68dvh,520px)] overflow-y-auto pt-2 pr-1">
          {STYLE_GROUPS.map((group) => {
            const expanded = expandedStyle === group.id;
            const selected = selectedStyle?.groupId === group.id;
            return <div key={group.id} className={`overflow-hidden border-b border-border-subtle ${selected ? "bg-accent-soft/40" : ""}`}>
              <motion.button type="button" onClick={() => setExpandedStyle((current) => current === group.id ? null : group.id)} whileTap={{ scale: 0.993 }} className="flex min-h-[54px] w-full items-center justify-between gap-3 px-2 py-2 text-left transition hover:bg-surface-secondary">
                <span className="min-w-0"><strong className="block truncate text-[10px] font-semibold text-main">{group.label}</strong><small className="mt-0.5 block truncate text-[8px] text-muted">{selected ? selectedStyle?.option : group.description}</small></span>
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted"><ChevronDown className="h-4 w-4" /></motion.span>
              </motion.button>
              <AnimatePresence initial={false}>
                {expanded ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.19 }} className="overflow-hidden"><div className="flex flex-wrap gap-1.5 px-2 pb-3">{group.options.map((option) => {
                  const active = selectedStyle?.groupId === group.id && selectedStyle.option === option;
                  return <motion.button key={option} type="button" onClick={() => chooseStyle(group, option)} whileTap={{ scale: 0.96 }} className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[8px] transition ${active ? "border-accent/30 bg-accent text-accent-foreground" : "border-border-subtle bg-surface-secondary text-muted hover:text-main"}`}>{active ? <Check className="h-2.5 w-2.5" /> : null}{option}</motion.button>;
                })}</div></motion.div> : null}
              </AnimatePresence>
            </div>;
          })}

          <div className="sticky top-0 z-10 mt-2 flex min-h-9 items-center gap-1.5 border-y border-border-subtle bg-surface-primary/95 px-2 text-[8px] font-bold uppercase tracking-[0.08em] text-accent backdrop-blur"><Sparkles className="h-3 w-3" />İnce ayarlar</div>
          {EXTRA_GROUPS.map((group) => {
            const expanded = expandedExtra === group.id;
            const value = extras[group.id];
            return <div key={group.id} className={`overflow-hidden border-b border-border-subtle ${value ? "bg-accent-soft/40" : ""}`}>
              <motion.button type="button" onClick={() => setExpandedExtra((current) => current === group.id ? null : group.id)} whileTap={{ scale: 0.993 }} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-2 py-2 text-left transition hover:bg-surface-secondary"><span className="min-w-0"><strong className="block text-[10px] font-semibold text-main">{group.label}</strong><small className="mt-0.5 block truncate text-[8px] text-muted">{value || "Seçim yap"}</small></span><motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-muted"><ChevronDown className="h-4 w-4" /></motion.span></motion.button>
              <AnimatePresence initial={false}>{expanded ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.19 }} className="overflow-hidden"><div className="flex flex-wrap gap-1.5 px-2 pb-3">{group.options.map((option) => {
                const active = value === option;
                return <motion.button key={option} type="button" onClick={() => setExtra(group.id, option)} whileTap={{ scale: 0.96 }} className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[8px] transition ${active ? "border-accent/30 bg-accent text-accent-foreground" : "border-border-subtle bg-surface-secondary text-muted hover:text-main"}`}>{active ? <Check className="h-2.5 w-2.5" /> : null}{option}</motion.button>;
              })}</div></motion.div> : null}</AnimatePresence>
            </div>;
          })}
          <div className="sticky bottom-0 mt-3 flex items-center justify-between border-t border-border-subtle bg-surface-primary/95 py-3 backdrop-blur"><span className="max-w-[70%] truncate text-[9px] text-muted">{selectedStyle ? `${selectedStyle.groupLabel} · ${selectedStyle.option}` : "Tarz seçilmedi"}</span><button type="button" onClick={() => setImageSheet(null)} className="h-9 rounded-xl bg-accent px-4 text-[9px] font-semibold text-accent-foreground">Tamam</button></div>
        </div>
      </InsightPickerSheet>
    </>,
    document.body,
  );
}
