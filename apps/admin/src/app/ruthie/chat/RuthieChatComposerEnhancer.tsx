"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Plus,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import styles from "./RuthieChatComposerEnhancer.module.css";

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

type Preview = {
  id: string;
  signature: string;
  name: string;
  type: string;
  url?: string;
};

type ImageQuote = {
  token: string;
  model: string;
  quality: ImageQuality;
  size: ImageSize;
  estimatedUsd: number;
  currency: "USD";
  expiresAt: string;
  note?: string;
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

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function nativeSetTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
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
    .replace(/@Fotoğraf\s+üret/gi, "")
    .replace(/\s{2,}/g, " ")
    .trimStart();
  nativeSetTextareaValue(textarea, next);
  window.setTimeout(() => textarea.setSelectionRange(next.length, next.length), 0);
}

function imagePromptFromTextarea(textarea: HTMLTextAreaElement) {
  return textarea.value.replace(/@Fotoğraf\s+üret/gi, "").replace(/\s+/g, " ").trim();
}

function previewSignature(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function RuthieChatComposerEnhancer() {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [menuMode, setMenuMode] = useState<MenuMode>(null);
  const [atQuery, setAtQuery] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [imageSelected, setImageSelected] = useState(false);
  const [quality, setQuality] = useState<ImageQuality>("medium");
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [imageStage, setImageStage] = useState<ImageStage>("idle");
  const [quote, setQuote] = useState<ImageQuote | null>(null);
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [actualCost, setActualCost] = useState<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nativeAttachmentsRef = useRef<HTMLElement | null>(null);
  const objectUrlsRef = useRef(new Set<string>());

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
      if (imageSelected && !/@Fotoğraf\s+üret/i.test(textarea.value)) {
        setImageSelected(false);
        setImageStage("idle");
        setQuote(null);
        setGenerated(null);
        setImageError(null);
      }
    };
    textarea.addEventListener("input", onInput);
    textarea.addEventListener("focus", onInput);
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

  const menuItems = useMemo(() => {
    const items = [
      { id: "attach", label: "Fotoğraf veya dosya ekle", detail: "Görsel, PDF, Word, Excel ve daha fazlası", icon: Paperclip },
      { id: "generate", label: "Fotoğraf üret", detail: "Kalite ve boyutu seç, fiyatı gör, sonra onayla", icon: WandSparkles },
    ];
    if (menuMode !== "at" || !atQuery.trim()) return items;
    const query = atQuery.toLocaleLowerCase("tr-TR");
    return items.filter((item) => `${item.label} ${item.detail}`.toLocaleLowerCase("tr-TR").includes(query));
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
          const next = `${targets.textarea.value.slice(0, tokenStart)}${targets.textarea.value.slice(cursor)}`.replace(/\s{2,}/g, " ");
          nativeSetTextareaValue(targets.textarea, next);
        }
      }
      targets.fileInput.click();
      return;
    }

    replaceCurrentAtToken(targets.textarea, IMAGE_COMMAND);
    setImageSelected(true);
    setImageStage("idle");
    setQuote(null);
    setGenerated(null);
    setActualCost(null);
    setImageError(null);
    window.setTimeout(() => targets.textarea.focus(), 20);
  }, [targets]);

  const removePreview = (preview: Preview) => {
    const native = nativeAttachmentsRef.current;
    const matching = native
      ? Array.from(native.children).find((child) => (child.textContent || "").includes(preview.name))
      : null;
    matching?.querySelector<HTMLButtonElement>("button")?.click();
    if (preview.url) {
      URL.revokeObjectURL(preview.url);
      objectUrlsRef.current.delete(preview.url);
    }
    setPreviews((current) => current.filter((item) => item.id !== preview.id));
  };

  const requestQuote = useCallback(async () => {
    if (!targets || imageStage === "quoting" || imageStage === "generating") return;
    const prompt = imagePromptFromTextarea(targets.textarea);
    if (!prompt) {
      setImageError("@Fotoğraf üret seçeneğinden sonra nasıl bir görsel istediğini yaz.");
      return;
    }
    setImageStage("quoting");
    setQuote(null);
    setImageError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/openai/image", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, quality, size }),
      });
      const payload = await response.json().catch(() => null) as any;
      if (!response.ok || !payload?.ok || !payload?.quote?.token) throw new Error(payload?.error || "Görsel fiyatı alınamadı.");
      setQuote(payload.quote as ImageQuote);
      setImageStage("quote");
    } catch (caught) {
      setImageError(caught instanceof Error ? caught.message : "Görsel fiyatı alınamadı.");
      setImageStage("idle");
    }
  }, [imageStage, quality, size, targets]);

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
    const prompt = imagePromptFromTextarea(targets.textarea);
    setImageStage("generating");
    setImageError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/openai/image", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, quality, size, quoteToken: quote.token, confirmed: true }),
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
    setImageStage("idle");
    setQuote(null);
    setGenerated(null);
    setActualCost(null);
    setImageError(null);
    window.setTimeout(() => targets.textarea.focus(), 30);
  };

  const setImageQuality = (next: ImageQuality) => {
    setQuality(next);
    setQuote(null);
    setImageStage("idle");
  };
  const setImageSize = (next: ImageSize) => {
    setSize(next);
    setQuote(null);
    setImageStage("idle");
  };

  if (!targets || typeof document === "undefined") return null;

  const dockOffset = previews.length ? 84 : 10;
  const menuOffset = imageSelected ? dockOffset + 126 : dockOffset;

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
          whileTap={{ scale: 0.9 }}
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
                  <motion.div key={preview.id} className={styles.previewCard} layout initial={{ opacity: 0, scale: 0.94, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.94, y: 4 }} transition={{ duration: 0.18 }}>
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
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className={styles.imageDockTop}>
                  <span className={styles.commandPill}><WandSparkles />{IMAGE_COMMAND}<motion.button type="button" onClick={cancelImageMode} whileTap={{ scale: 0.84 }} aria-label="Fotoğraf üret aracını kaldır"><X /></motion.button></span>
                  <span className={styles.imageDockHint}>{imageStage === "quoting" ? "Fiyat hesaplanıyor…" : imageStage === "generating" ? "Üretiliyor…" : "Ayarlarını seç"}</span>
                </div>

                <div className={styles.inlineOptions}>
                  <div className={styles.optionGroup}><span>Kalite</span><div>{(Object.keys(QUALITY_LABELS) as ImageQuality[]).map((item) => <motion.button key={item} type="button" data-active={quality === item ? "true" : "false"} onClick={() => setImageQuality(item)} whileTap={{ scale: 0.95 }}>{quality === item ? <Check /> : null}{QUALITY_LABELS[item]}</motion.button>)}</div></div>
                  <div className={styles.optionGroup}><span>Boyut</span><div>{(Object.keys(SIZE_LABELS) as ImageSize[]).map((item) => <motion.button key={item} type="button" data-active={size === item ? "true" : "false"} onClick={() => setImageSize(item)} whileTap={{ scale: 0.95 }}>{size === item ? <Check /> : null}{SIZE_LABELS[item]}</motion.button>)}</div></div>
                </div>

                {imageError ? <motion.div className={styles.inlineError} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{imageError}</motion.div> : null}

                <AnimatePresence mode="wait" initial={false}>
                  {imageStage === "quote" && quote ? (
                    <motion.div key="quote" className={styles.quoteBar} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
                      <div><span>Tahmini görsel ücreti</span><strong>{formatUsd(quote.estimatedUsd)}</strong><small>{QUALITY_LABELS[quote.quality]} · {SIZE_LABELS[quote.size]}</small></div>
                      <div className={styles.quoteActions}><motion.button type="button" className={styles.cancelButton} onClick={() => { setQuote(null); setImageStage("idle"); }} whileTap={{ scale: 0.96 }}>İptal</motion.button><motion.button type="button" className={styles.confirmButton} onClick={() => void confirmGeneration()} whileTap={{ scale: 0.96 }}><Check /> Kabul et ve üret</motion.button></div>
                    </motion.div>
                  ) : imageStage === "generating" ? (
                    <motion.div key="generating" className={styles.generatingBar} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LoaderCircle className={styles.spin} /><span>ROSTA Insight fotoğrafı üretiyor. Ücret onaylandı.</span><motion.i initial={{ x: "-100%" }} animate={{ x: "250%" }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} /></motion.div>
                  ) : (
                    <motion.div key="idle" className={styles.dockActions} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><span>Gönder’e basınca önce fiyat gösterilir. Onay vermeden üretim başlamaz.</span><motion.button type="button" onClick={() => void requestQuote()} disabled={imageStage === "quoting"} whileTap={{ scale: 0.96 }}>{imageStage === "quoting" ? <><LoaderCircle className={styles.spin} /> Hesaplanıyor</> : <><Sparkles /> Fiyatı göster</>}</motion.button></motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {menuMode ? (
              <motion.div
                data-ruthie-composer-enhancer-menu
                className={styles.commandMenu}
                style={{ bottom: `calc(100% + ${menuOffset}px)` }}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className={styles.commandHeader}>{menuMode === "at" ? <><span className={styles.atMark}>@</span><span>ROSTA Insight araçları</span></> : <span>Ekle ve oluştur</span>}</div>
                <div className={styles.commandItems}>
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    return <motion.button type="button" key={item.id} onClick={() => chooseMenuItem(item.id)} whileHover={{ x: 2 }} whileTap={{ scale: 0.985 }}><span className={styles.commandIcon}><Icon /></span><span className={styles.commandCopy}><strong>{item.label}</strong><small>{item.detail}</small></span>{item.id === "generate" ? <span className={styles.commandShortcut}>@fotoğraf</span> : null}</motion.button>;
                  })}
                  {!menuItems.length ? <div className={styles.commandEmpty}>Bu @ komutuyla eşleşen araç yok.</div> : null}
                </div>
                <div className={styles.commandFooter}>İpucu: mesaj alanına <b>@</b> yazınca bu menü açılır.</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>,
        targets.composer,
      )}

      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {toast ? <motion.div className={styles.toast} initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}><ImageIcon /><span>{toast}</span>{generated && actualCost != null ? <small>{formatUsd(actualCost)}</small> : null}</motion.div> : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  );
}
