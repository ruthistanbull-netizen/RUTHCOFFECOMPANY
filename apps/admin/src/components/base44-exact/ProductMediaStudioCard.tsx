"use client";

import { Film, ImagePlus, Upload } from "lucide-react";
import { LoadingIndicator, Progress } from "@ruth-commerce/ui";
import { useEffect, useRef, useState } from "react";
import { adminAuthHeaders, apiUrl } from "@/lib/adminApi";
import { SortableProductMediaGrid } from "@/components/products/SortableProductMediaGrid";
import { ExactDataCard } from "./data";
import { ExactProductImageEditor } from "./ExactProductImageEditor";
import { useExactToast } from "./primitives";

const PRODUCT_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
const VIDEO_PROXY_CHUNK_BYTES = 2 * 1024 * 1024;
const VIDEO_RETRY_DELAYS = [0, 1_500, 3_000, 5_000, 8_000];

function isVideoUrl(value: string) {
  const clean = String(value || "").split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(clean) || clean.includes("/videos/");
}

function uniqueMedia(media: string[]) {
  const unique = [...new Set(media.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!unique.length || !isVideoUrl(unique[0])) return unique;
  const firstImageIndex = unique.findIndex((value) => !isVideoUrl(value));
  if (firstImageIndex <= 0) return unique;
  const [firstImage] = unique.splice(firstImageIndex, 1);
  return [firstImage, ...unique];
}

function videoContentType(file: File) {
  if (file.type === "video/webm") return "video/webm";
  if (file.type === "video/quicktime") return "video/quicktime";
  if (file.type === "video/mp4") return "video/mp4";
  const name = file.name.toLowerCase();
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  return "";
}

function isVideoFile(file: File) {
  return Boolean(videoContentType(file));
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

type UploadResponse = { ok?: boolean; url?: string; error?: string };
type VideoUploadSessionResponse = UploadResponse & {
  uploadUrl?: string;
  path?: string;
  contentType?: string;
};

type ChunkUploadResponse = {
  ok?: boolean;
  nextOffset?: number;
  offset?: number;
  error?: string;
};

async function uploadFile(
  file: File,
  endpoint: string,
  fallbackError: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const headers = await adminAuthHeaders();
  const body = new FormData();
  body.append("file", file);

  const result = await new Promise<UploadResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", apiUrl(endpoint));
    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, String(value)));

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };

    request.onerror = () => reject(new Error("Medya yüklenirken bağlantı hatası oluştu."));
    request.onabort = () => reject(new Error("Medya yükleme iptal edildi."));
    request.onload = () => {
      let payload: UploadResponse = {};
      try {
        payload = JSON.parse(request.responseText || "{}") as UploadResponse;
      } catch {}

      if (request.status < 200 || request.status >= 300 || !payload.ok || !payload.url) {
        reject(new Error(payload.error || fallbackError));
        return;
      }
      resolve(payload);
    };

    request.send(body);
  });

  const url = String(result.url || "");
  if (!url) throw new Error(fallbackError);
  return url;
}

async function uploadOneImage(file: File, onProgress: (progress: number) => void) {
  return uploadFile(file, "/api/media/product-image", "Görsel yüklenemedi.", onProgress);
}

async function createVideoUploadSession(file: File) {
  if (file.size <= 0) throw new Error("Video dosyası boş görünüyor.");
  if (file.size > PRODUCT_VIDEO_MAX_BYTES) throw new Error("Video en fazla 60 MB olabilir.");
  const contentType = videoContentType(file);
  if (!contentType) throw new Error("Yalnız MP4, WebM veya MOV video yüklenebilir.");

  const authHeaders = await adminAuthHeaders();
  const response = await fetch(apiUrl("/api/media/product-video"), {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      contentType,
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as VideoUploadSessionResponse;
  if (!response.ok || !payload.ok || !payload.uploadUrl || !payload.url) {
    throw new Error(payload.error || "Video yükleme oturumu oluşturulamadı.");
  }
  return payload;
}

async function readProxyOffset(uploadUrl: string) {
  try {
    const authHeaders = await adminAuthHeaders();
    const response = await fetch(apiUrl("/api/media/product-video/chunk"), {
      method: "GET",
      headers: {
        ...authHeaders,
        "x-ruth-upload-url": uploadUrl,
      },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as ChunkUploadResponse;
    const offset = Number(payload.offset);
    if (!response.ok || !payload.ok || !Number.isFinite(offset) || offset < 0) return null;
    return offset;
  } catch {
    return null;
  }
}

async function patchProxyChunk(
  uploadUrl: string,
  chunk: Blob,
  offset: number,
  fileSize: number,
  onProgress: (progress: number) => void,
) {
  const authHeaders = await adminAuthHeaders();

  return new Promise<number>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PATCH", apiUrl("/api/media/product-video/chunk"));
    request.timeout = 90_000;
    Object.entries(authHeaders).forEach(([key, value]) => request.setRequestHeader(key, String(value)));
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("x-ruth-upload-url", uploadUrl);
    request.setRequestHeader("x-ruth-upload-offset", String(offset));

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const loaded = Math.min(fileSize, offset + event.loaded);
      onProgress(Math.max(1, Math.min(99, Math.round((loaded / fileSize) * 100))));
    };

    request.onerror = () => reject(new Error("Video parçası panele gönderilirken bağlantı koptu."));
    request.ontimeout = () => reject(new Error("Video parçası 90 saniye içinde tamamlanamadı."));
    request.onabort = () => reject(new Error("Video yükleme iptal edildi."));
    request.onload = () => {
      let payload: ChunkUploadResponse = {};
      try {
        payload = JSON.parse(request.responseText || "{}") as ChunkUploadResponse;
      } catch {}

      const nextOffset = Number(payload.nextOffset);
      if (
        request.status >= 200 &&
        request.status < 300 &&
        payload.ok &&
        Number.isFinite(nextOffset) &&
        nextOffset > offset
      ) {
        resolve(nextOffset);
        return;
      }

      reject(new Error(payload.error || `Video parçası yüklenemedi (${request.status}).`));
    };

    request.send(chunk);
  });
}

async function uploadOneVideo(file: File, onProgress: (progress: number) => void) {
  const session = await createVideoUploadSession(file);
  const uploadUrl = String(session.uploadUrl);
  let offset = 0;

  while (offset < file.size) {
    const chunkEnd = Math.min(file.size, offset + VIDEO_PROXY_CHUNK_BYTES);
    const chunk = file.slice(offset, chunkEnd);
    let uploaded = false;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < VIDEO_RETRY_DELAYS.length; attempt += 1) {
      if (VIDEO_RETRY_DELAYS[attempt]) await sleep(VIDEO_RETRY_DELAYS[attempt]);
      try {
        offset = await patchProxyChunk(
          uploadUrl,
          chunk,
          offset,
          file.size,
          onProgress,
        );
        uploaded = true;
        break;
      } catch (caught) {
        lastError = caught;
        const remoteOffset = await readProxyOffset(uploadUrl);
        if (remoteOffset != null && remoteOffset > offset) {
          offset = remoteOffset;
          uploaded = true;
          break;
        }
      }
    }

    if (!uploaded) {
      throw lastError instanceof Error ? lastError : new Error("Video yükleme devam ettirilemedi.");
    }
  }

  onProgress(100);
  return String(session.url);
}

export function ProductMediaStudioCard({
  images,
  onChange,
  onEdit,
  busy,
  onBusyChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  onEdit?: (index: number) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  photoUrl?: string;
  onPhotoUrlChange?: (value: string) => void;
}) {
  const toast = useExactToast();
  const imagesRef = useRef(images);
  const [uploadingHere, setUploadingHere] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadName, setUploadName] = useState("");
  const [uploadCount, setUploadCount] = useState({ current: 0, total: 0 });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    imagesRef.current = uniqueMedia(images);
  }, [images]);

  useEffect(() => {
    if (editingIndex != null && !images[editingIndex]) setEditingIndex(null);
  }, [editingIndex, images]);

  const applyImages = (nextImages: string[]) => {
    const next = uniqueMedia(nextImages);
    imagesRef.current = next;
    onChange(next);
  };

  const openEditor = (index: number) => {
    if (isVideoUrl(imagesRef.current[index] || "")) return;
    if (onEdit) {
      onEdit(index);
      return;
    }
    setEditingIndex(index);
  };

  const replaceEditedPhoto = (url: string) => {
    if (editingIndex == null) return;
    applyImages(imagesRef.current.map((image, index) => index === editingIndex ? url : image));
  };

  const uploadMedia = async (inputFiles: File[]) => {
    const files = inputFiles.filter((file) => file.type.startsWith("image/") || isVideoFile(file));
    if (!files.length) {
      toast.error("JPG, PNG, WebP, MP4, WebM veya MOV dosyası yükleyebilirsin.");
      return;
    }
    const hasExistingImage = imagesRef.current.some((item) => !isVideoUrl(item));
    const hasIncomingImage = files.some((file) => file.type.startsWith("image/"));
    if (!hasExistingImage && !hasIncomingImage) {
      toast.error("Ürünün ana medyası fotoğraf olmalı. Önce en az bir ürün fotoğrafı ekle.");
      return;
    }
    if (busy || uploadingHere) return;

    setUploadingHere(true);
    onBusyChange(true);
    setProgress(0);
    setUploadCount({ current: 1, total: files.length });

    const uploaded: string[] = [];
    const failures: string[] = [];
    let imageCount = 0;
    let videoCount = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const video = isVideoFile(file);
        setUploadName(file.name);
        setUploadCount({ current: index + 1, total: files.length });

        try {
          const url = video
            ? await uploadOneVideo(file, (fileProgress) => {
                const overall = ((index + fileProgress / 100) / files.length) * 100;
                setProgress(Math.max(1, Math.min(99, Math.round(overall))));
              })
            : await uploadOneImage(file, (fileProgress) => {
                const overall = ((index + fileProgress / 100) / files.length) * 100;
                setProgress(Math.max(1, Math.min(99, Math.round(overall))));
              });
          uploaded.push(url);
          if (video) videoCount += 1;
          else imageCount += 1;
          setProgress(Math.min(99, Math.round(((index + 1) / files.length) * 100)));
        } catch (caught) {
          failures.push(`${file.name}: ${caught instanceof Error ? caught.message : "yüklenemedi"}`);
        }
      }

      if (uploaded.length) {
        setProgress(100);
        applyImages([...imagesRef.current, ...uploaded]);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
      }

      if (uploaded.length === files.length) {
        if (videoCount && imageCount) toast.success(`${imageCount} görsel ve ${videoCount} video ürün medyasına eklendi.`);
        else if (videoCount) toast.success(videoCount === 1 ? "Video ürün medyasına eklendi ve 3:4 çerçevede gösterilecek." : `${videoCount} video ürün medyasına eklendi ve 3:4 çerçevede gösterilecek.`);
        else toast.success(imageCount === 1 ? "Görsel 3:4 optimize edildi ve galeriye eklendi." : `${imageCount} görsel 3:4 optimize edildi ve galeriye eklendi.`);
      } else if (uploaded.length) {
        toast.success(`${uploaded.length} medya yüklendi. ${failures.length} dosya yüklenemedi.`);
        toast.error(failures[0]);
      } else {
        toast.error(failures[0] || "Medya dosyaları yüklenemedi.");
      }
    } finally {
      setUploadingHere(false);
      onBusyChange(false);
      setProgress(0);
      setUploadName("");
      setUploadCount({ current: 0, total: 0 });
    }
  };

  return (
    <>
      <ExactDataCard
        title="Ürün Medyası"
        action={
          <div className="flex items-center gap-2">
            <span className="ruth-type-caption hidden text-muted md:inline">Fotoğraf + video · sürükleyerek sırala · ilk fotoğraf ana</span>
            <div className="flex items-center gap-1 text-accent"><ImagePlus className="h-4 w-4" /><Film className="h-4 w-4" /></div>
          </div>
        }
      >
        {images.length ? (
          <SortableProductMediaGrid
            images={uniqueMedia(images)}
            onChange={applyImages}
            onEdit={openEditor}
            onRemove={(index) => applyImages(imagesRef.current.filter((_, itemIndex) => itemIndex !== index))}
            mainLabel="ANA GÖRSEL"
          />
        ) : (
          <div className="ruth-type-caption mb-3 rounded-[var(--radius-control)] border border-dashed border-border-subtle bg-surface-secondary p-4 text-center text-muted">
            Henüz ürün medyası yok. En az bir fotoğraf ekle; video da aynı alana eklenebilir.
          </div>
        )}

        <div className="mt-3">
          <label
            className={`relative flex min-h-24 w-full items-center justify-center gap-3 overflow-hidden border border-dashed px-4 radius-small transition-all ${uploadingHere ? "pointer-events-none border-accent/40 bg-accent-soft/50" : busy ? "pointer-events-none cursor-wait border-border-subtle bg-surface-secondary opacity-60" : "cursor-pointer border-border-strong bg-surface-secondary text-subtle hover:border-accent hover:text-accent"}`}
            aria-live="polite"
            aria-busy={uploadingHere || undefined}
          >
            {uploadingHere ? (
              <>
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-primary shadow-soft text-accent">
                  <LoadingIndicator size="md" />
                </span>
                <span className="min-w-0 flex-1">
                  <Progress
                    value={progress}
                    label={uploadCount.total > 1 ? `${uploadCount.current}/${uploadCount.total} yükleniyor` : "Medya yükleniyor"}
                    showValue
                    className="text-accent"
                  />
                  <small className="ruth-type-code mt-1 block truncate text-muted">{uploadName}</small>
                </span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" />
                <span className="grid gap-1">
                  <strong className="ruth-type-control text-main">Fotoğraf veya video yükle</strong>
                  <small className="ruth-type-caption text-muted">Görseller 3:4 optimize edilir; videolar küçük parçalar halinde güvenli şekilde yüklenir</small>
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.m4v,.mov,.webm"
              multiple
              className="hidden"
              disabled={busy || uploadingHere}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (files.length) void uploadMedia(files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <p className="ruth-type-caption mt-2 text-muted">
          Fotoğraf ve videoları birlikte sıralayabilirsin. Ana ürün medyası her zaman bir fotoğraf olarak korunur; videolar otomatik oynatılan 3:4 önizleme kartında görünür. Büyük videolar panel üzerinden küçük parçalar halinde yüklenir ve bağlantı kesilirse kaldığı parçadan yeniden denenir. Video limiti 60 MB'dır.
        </p>
      </ExactDataCard>

      {!onEdit ? (
        <ExactProductImageEditor
          open={editingIndex != null}
          imageUrl={editingIndex == null ? null : images[editingIndex] || null}
          onClose={() => setEditingIndex(null)}
          onSave={replaceEditedPhoto}
        />
      ) : null}
    </>
  );
}
