"use client";

import {
  Boxes,
  Database,
  Layers,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  InlineFeedback,
  Pressable,
  useSaveLifecycle,
  useSaveLifecycleSource,
} from "@ruth-commerce/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactDataCard } from "./data";
import {
  ExactButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSkeleton,
  useExactToast,
} from "./primitives";
import { ExactWorkspaceModal } from "./ExactWorkspaceModal";

type PermissionState = "granted" | "missing" | "unknown";
type CatalogSource = "owned" | "shared" | "configured";

type CatalogSummary = {
  id: string;
  name: string;
  vertical: string | null;
  productCount: number | null;
  source: CatalogSource;
  editable: boolean;
  configured: boolean;
};

type CatalogDetail = CatalogSummary & {
  feeds: Array<{ id: string; name: string }>;
  productSets: Array<{ id: string; name: string }>;
  sampleProducts: Array<{
    id: string;
    name: string;
    retailerId: string | null;
    availability: string | null;
    price: string | null;
    currency: string | null;
    imageUrl: string | null;
    url: string | null;
  }>;
  warnings: string[];
};

type CatalogListPayload = {
  ok: boolean;
  fetchedAt: string;
  businessId: string;
  configuredCatalogId: string | null;
  catalogs: CatalogSummary[];
  permissions: {
    catalogManagement: PermissionState;
    businessManagement: PermissionState;
  };
  warnings: string[];
};

type DetailPayload = { ok: boolean; catalog: CatalogDetail };
type MutationPayload = { ok: boolean; catalog: CatalogSummary; warning?: string | null };

type EditorState =
  | { mode: "create"; catalog: null }
  | { mode: "edit"; catalog: CatalogSummary }
  | null;

const VERTICAL_OPTIONS = [
  { value: "commerce", label: "E-ticaret / Ürünler" },
  { value: "hotels", label: "Oteller" },
  { value: "flights", label: "Uçuşlar" },
  { value: "destinations", label: "Destinasyonlar" },
  { value: "home_listings", label: "Emlak" },
  { value: "vehicles", label: "Araçlar" },
] as const;

const VERTICAL_LABELS = Object.fromEntries(
  VERTICAL_OPTIONS.map((item) => [item.value, item.label]),
);

function verticalLabel(value: string | null) {
  if (!value) return "Belirtilmemiş";
  return VERTICAL_LABELS[value] || value;
}

function sourceLabel(source: CatalogSource) {
  if (source === "owned") return "İşletmeye ait";
  if (source === "shared") return "Paylaşılan";
  return "ENV kataloğu";
}

function permissionLabel(state: PermissionState) {
  if (state === "granted") return "Yönetim izni hazır";
  if (state === "missing") return "Yönetim izni eksik";
  return "Yönetim izni doğrulanamadı";
}

function productCount(value: number | null) {
  return value == null ? "—" : value.toLocaleString("tr-TR");
}

function DetailStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Package;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="ruth-type-label uppercase tracking-[0.07em] text-subtle">{label}</p>
          <p className="ruth-type-metric mt-2 truncate text-main">{value}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

export function ExactMetaCatalogs() {
  const toast = useExactToast();
  const {
    save: saveLifecycle,
    requestTransition,
    saving: savePending,
  } = useSaveLifecycle();
  const [payload, setPayload] = useState<CatalogListPayload | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionDetail, setConnectionDetail] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogSummary | null>(null);
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("commerce");
  const [saveError, setSaveError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const load = useCallback(async ({
    initial = false,
    silent = false,
  }: {
    initial?: boolean;
    silent?: boolean;
  } = {}) => {
    if (initial) setInitialLoading(true);
    else if (!silent) setRefreshing(true);

    try {
      const integrationStatus = await adminRequest<{ integrations?: { meta?: { connected?: boolean; detail?: string } } }>(
        "/api/rosta-insight/integrations/status-v2",
        { force: true },
      );
      const metaState = integrationStatus.integrations?.meta;
      if (!metaState?.connected) {
        setConnectionDetail(metaState?.detail || "ROSTA Meta Marketing hesabı henüz bağlı değil.");
        setPayload(null);
        setError(null);
        return;
      }
      setConnectionDetail(null);

      const result = await adminRequest<CatalogListPayload>("/api/meta-catalogs", {
        force: true,
        hardRefresh: true,
        timeoutMs: 30_000,
        ttlMs: 0,
        staleMs: 0,
      });
      setPayload(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Meta katalogları alınamadı.");
    } finally {
      if (initial) setInitialLoading(false);
      else if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load({ initial: true });
  }, [load]);

  const catalogs = payload?.catalogs || [];
  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("tr-TR");
    if (!text) return catalogs;
    return catalogs.filter((catalog) => (
      catalog.name.toLocaleLowerCase("tr-TR").includes(text)
      || catalog.id.includes(text)
      || verticalLabel(catalog.vertical).toLocaleLowerCase("tr-TR").includes(text)
    ));
  }, [catalogs, query]);

  const totalProducts = catalogs.reduce(
    (sum, catalog) => sum + Number(catalog.productCount || 0),
    0,
  );
  const ownedCount = catalogs.filter((catalog) => catalog.source === "owned").length;
  const sharedCount = catalogs.filter((catalog) => catalog.source === "shared").length;
  const permissionState = payload?.permissions.catalogManagement || "unknown";
  const canCreate = permissionState !== "missing";

  const closeDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setSelected(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  const openDetail = useCallback(async (catalog: CatalogSummary) => {
    const requestId = ++detailRequestRef.current;
    setSelected(catalog);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const result = await adminRequest<DetailPayload>(
        `/api/meta-catalogs/${encodeURIComponent(catalog.id)}`,
        {
          force: true,
          hardRefresh: true,
          timeoutMs: 30_000,
          ttlMs: 0,
          staleMs: 0,
        },
      );
      if (detailRequestRef.current !== requestId) return;
      setDetail(result.catalog);
    } catch (caught) {
      if (detailRequestRef.current !== requestId) return;
      setDetailError(
        caught instanceof Error ? caught.message : "Katalog detayı alınamadı.",
      );
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }, []);

  const openCreate = () => {
    closeDetail();
    setEditor({ mode: "create", catalog: null });
    setName("");
    setVertical("commerce");
    setSaveError(null);
  };

  const openEdit = (catalog: CatalogSummary) => {
    closeDetail();
    setEditor({ mode: "edit", catalog });
    setName(catalog.name);
    setVertical(catalog.vertical || "commerce");
    setSaveError(null);
  };

  const editorDirty = Boolean(editor) && (
    editor?.mode === "create"
      ? name.trim().length > 0 || vertical !== "commerce"
      : name !== editor?.catalog.name
  );

  const closeEditorImmediately = useCallback(() => {
    setEditor(null);
    setSaveError(null);
  }, []);

  const requestEditorClose = useCallback(() => {
    if (savePending) return;
    void requestTransition(closeEditorImmediately);
  }, [closeEditorImmediately, requestTransition, savePending]);

  const reconcileCatalog = useCallback((catalog: CatalogSummary, created: boolean) => {
    setPayload((current) => {
      if (!current) return current;
      const exists = current.catalogs.some((item) => item.id === catalog.id);
      const next = exists
        ? current.catalogs.map((item) => item.id === catalog.id ? catalog : item)
        : created
          ? [...current.catalogs, catalog]
          : current.catalogs;
      return {
        ...current,
        catalogs: next.slice().sort((a, b) => a.name.localeCompare(b.name, "tr")),
      };
    });
  }, []);

  const validateEditor = useCallback(() => {
    if (!editor) return true;
    if (name.trim().length >= 2) return true;
    setSaveError("Katalog adı en az 2 karakter olmalı.");
    return false;
  }, [editor, name]);

  const persistEditor = useCallback(async () => {
    if (!editor) return true;
    setSaveError(null);

    try {
      const isCreate = editor.mode === "create";
      const path = isCreate
        ? "/api/meta-catalogs"
        : `/api/meta-catalogs/${encodeURIComponent(editor.catalog.id)}`;
      const result = await adminRequest<MutationPayload>(path, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreate ? { name, vertical } : { name }),
        timeoutMs: 30_000,
        confirmation: isCreate
          ? "Meta Business hesabında yeni bir ürün kataloğu oluşturulacak. Devam edilsin mi?"
          : "Meta kataloğunun adı güncellenecek. Devam edilsin mi?",
        invalidate: ["/api/meta-catalogs"],
      });

      reconcileCatalog(result.catalog, isCreate);
      toast.success(isCreate ? "Meta kataloğu oluşturuldu." : "Meta kataloğu güncellendi.");
      if (result.warning) toast.warning(result.warning);

      // The durable Meta mutation already succeeded. Revalidation is secondary
      // read-model work and must not create a second Save loader.
      void load({ silent: true });
      return true;
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Katalog kaydedilemedi.");
      return false;
    }
  }, [editor, load, name, reconcileCatalog, toast, vertical]);

  const discardEditor = useCallback(() => {
    if (!editor) return;
    if (editor.mode === "edit") {
      setName(editor.catalog.name);
      setVertical(editor.catalog.vertical || "commerce");
    } else {
      setName("");
      setVertical("commerce");
    }
    setSaveError(null);
  }, [editor]);

  useSaveLifecycleSource({
    id: "meta-catalog-editor",
    dirty: editorDirty,
    validate: validateEditor,
    save: persistEditor,
    discard: discardEditor,
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor || savePending) return;
    const saved = await saveLifecycle();
    if (saved) closeEditorImmediately();
  };

  const listUnavailable = initialLoading && !payload;

  if (connectionDetail) {
    return (
      <div className="space-y-4 animate-fade-in" data-exact-base44-page="meta-catalogs">
        <ExactPageHeader title="Meta Katalogları" subtitle="ROSTA Meta Business / Commerce Manager kataloglarını görüntüle ve yönet" />
        <ExactDataCard title="Meta Marketing bağlantısı gerekli">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-main">ROSTA Meta hesabı henüz bağlı değil.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{connectionDetail}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">Altyapı hazır; Business Manager, katalog ve gerekli izinleri bağladığında kataloglar burada otomatik görünecek.</p>
            </div>
            <ExactButton className="shrink-0" onClick={() => { window.location.href = "/settings/integrations"; }}>Meta'yı Bağla</ExactButton>
          </div>
        </ExactDataCard>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="meta-catalogs">
      <ExactPageHeader
        title="Meta Katalogları"
        subtitle="Meta Business / Commerce Manager kataloglarını görüntüle ve yönet"
        actions={(
          <div className="flex items-center gap-2">
            <ExactButton
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              loading={refreshing}
              disabled={listUnavailable}
            >
              {!refreshing ? <RefreshCw className="h-4 w-4" /> : null}
              Yenile
            </ExactButton>
            <ExactButton size="sm" onClick={openCreate} disabled={!canCreate || listUnavailable}>
              <Plus className="h-4 w-4" /> Yeni katalog
            </ExactButton>
          </div>
        )}
      />

      {error ? (
        <InlineFeedback
          tone="danger"
          message={error}
          retryLabel="Tekrar yükle"
          onRetry={() => void load({ initial: !payload })}
          retrying={initialLoading || refreshing}
        />
      ) : null}

      {payload?.warnings?.length ? (
        <InlineFeedback tone="warning" message={payload.warnings.join(" ")} />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DetailStat label="Katalog" value={catalogs.length.toLocaleString("tr-TR")} icon={Layers} />
        <DetailStat label="Toplam ürün" value={totalProducts.toLocaleString("tr-TR")} icon={Package} />
        <DetailStat label="İşletmeye ait" value={ownedCount.toLocaleString("tr-TR")} icon={Database} />
        <DetailStat label="Paylaşılan" value={sharedCount.toLocaleString("tr-TR")} icon={Boxes} />
      </div>

      <ExactDataCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ExactSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Katalog adı, ID veya tür ara..."
            className="w-full sm:max-w-sm"
          />
          <div className="ruth-type-caption inline-flex items-center gap-2 text-muted">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {permissionLabel(permissionState)}
          </div>
        </div>
      </ExactDataCard>

      {listUnavailable ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Meta katalogları yükleniyor">
          <ExactSkeleton className="h-48" />
          <ExactSkeleton className="h-48" />
          <ExactSkeleton className="h-48" />
        </div>
      ) : filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((catalog) => (
            <article
              key={catalog.id}
              className="group rounded-2xl border border-border-subtle bg-surface-primary p-4 shadow-card transition-shadow hover:shadow-floating"
            >
              <Pressable
                type="button"
                pressStrength="subtle"
                hoverLift
                onClick={() => void openDetail(catalog)}
                className="block w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`${catalog.name} katalog detayını aç`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Layers className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {catalog.configured ? (
                      <span className="ruth-type-label rounded-full bg-success-soft px-2 py-1 font-semibold text-success-foreground">
                        ENV aktif
                      </span>
                    ) : null}
                    <span className="ruth-type-label rounded-full bg-surface-secondary px-2 py-1 font-semibold text-muted">
                      {sourceLabel(catalog.source)}
                    </span>
                  </div>
                </div>
                <h2 className="ruth-type-card-title mt-4 truncate text-main">{catalog.name}</h2>
                <p className="ruth-type-caption mt-1 text-subtle">ID {catalog.id}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-surface-secondary p-3">
                    <p className="ruth-type-label uppercase tracking-wide text-subtle">Tür</p>
                    <p className="ruth-type-table mt-1 truncate font-semibold text-main">
                      {verticalLabel(catalog.vertical)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-secondary p-3">
                    <p className="ruth-type-label uppercase tracking-wide text-subtle">Ürün</p>
                    <p className="ruth-type-table mt-1 font-semibold text-main">
                      {productCount(catalog.productCount)}
                    </p>
                  </div>
                </div>
              </Pressable>

              <div className="mt-4 flex gap-2 border-t border-border-subtle pt-3">
                <ExactButton
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => void openDetail(catalog)}
                  loading={detailLoading && selected?.id === catalog.id}
                >
                  Görüntüle
                </ExactButton>
                {catalog.editable ? (
                  <ExactButton
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(catalog)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Düzenle
                  </ExactButton>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <ExactDataCard>
          <div className="py-12 text-center">
            <Layers className="mx-auto h-9 w-9 text-subtle" aria-hidden="true" />
            <p className="ruth-type-card-title mt-3 text-main">Katalog bulunamadı</p>
            <p className="ruth-type-caption mt-1 text-muted">
              {query.trim()
                ? "Arama ölçütlerini değiştir veya aramayı temizle."
                : "Meta Business hesabında erişebildiğin kataloglar burada görünür."}
            </p>
          </div>
        </ExactDataCard>
      )}

      <ExactWorkspaceModal
        open={Boolean(selected)}
        onClose={closeDetail}
        title={selected?.name || "Meta Kataloğu"}
        subtitle={selected ? `Katalog ID ${selected.id}` : undefined}
        headerActions={selected?.editable ? (
          <ExactButton
            variant="secondary"
            size="sm"
            onClick={() => selected && openEdit(selected)}
          >
            <Pencil className="h-4 w-4" /> Düzenle
          </ExactButton>
        ) : null}
      >
        {detailLoading ? (
          <div className="space-y-3" aria-label="Katalog detayı yükleniyor">
            <ExactSkeleton className="h-28" />
            <ExactSkeleton className="h-52" />
          </div>
        ) : detailError ? (
          <InlineFeedback
            tone="danger"
            message={detailError}
            retryLabel="Detayı tekrar yükle"
            onRetry={() => selected && void openDetail(selected)}
          />
        ) : detail ? (
          <div className="mx-auto max-w-5xl space-y-4">
            {detail.warnings.length ? (
              <InlineFeedback tone="warning" message={detail.warnings.join(" ")} />
            ) : null}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <DetailStat label="Ürün" value={productCount(detail.productCount)} icon={Package} />
              <DetailStat label="Ürün akışı" value={detail.feeds.length.toLocaleString("tr-TR")} icon={Database} />
              <DetailStat label="Ürün seti" value={detail.productSets.length.toLocaleString("tr-TR")} icon={Boxes} />
              <DetailStat label="Erişim" value={detail.editable ? "Düzenlenebilir" : "Salt okunur"} icon={ShieldCheck} />
            </div>

            <ExactDataCard title="Katalog bilgileri">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="ruth-type-label text-subtle">Ad</p>
                  <p className="ruth-type-table mt-1 break-words font-semibold text-main">{detail.name}</p>
                </div>
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="ruth-type-label text-subtle">Tür</p>
                  <p className="ruth-type-table mt-1 font-semibold text-main">{verticalLabel(detail.vertical)}</p>
                </div>
                <div className="rounded-xl bg-surface-secondary p-3">
                  <p className="ruth-type-label text-subtle">Kaynak</p>
                  <p className="ruth-type-table mt-1 font-semibold text-main">{sourceLabel(detail.source)}</p>
                </div>
              </div>
            </ExactDataCard>

            <div className="grid gap-3 lg:grid-cols-2">
              <ExactDataCard title="Ürün akışları">
                {detail.feeds.length ? (
                  <div className="space-y-2">
                    {detail.feeds.map((feed) => (
                      <div key={feed.id} className="rounded-xl bg-surface-secondary p-3">
                        <p className="ruth-type-table break-words font-semibold text-main">{feed.name}</p>
                        <p className="ruth-type-caption break-all text-subtle">ID {feed.id}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ruth-type-caption text-muted">Bu katalogda erişilebilir ürün akışı yok.</p>
                )}
              </ExactDataCard>

              <ExactDataCard title="Ürün setleri">
                {detail.productSets.length ? (
                  <div className="space-y-2">
                    {detail.productSets.map((set) => (
                      <div key={set.id} className="rounded-xl bg-surface-secondary p-3">
                        <p className="ruth-type-table break-words font-semibold text-main">{set.name}</p>
                        <p className="ruth-type-caption break-all text-subtle">ID {set.id}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ruth-type-caption text-muted">Bu katalogda erişilebilir ürün seti yok.</p>
                )}
              </ExactDataCard>
            </div>

            <ExactDataCard title="Örnek ürünler">
              {detail.sampleProducts.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {detail.sampleProducts.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-xl bg-surface-secondary p-3">
                      <div className="h-14 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-tertiary">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full place-items-center">
                            <Package className="h-4 w-4 text-subtle" aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="ruth-type-table truncate font-semibold text-main">{product.name}</p>
                        <p className="ruth-type-caption truncate text-subtle">{product.retailerId || product.id}</p>
                        {product.price ? (
                          <p className="ruth-type-caption mt-0.5 font-medium text-main">
                            {product.price}{product.currency ? ` ${product.currency}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ruth-type-caption text-muted">Örnek ürün bilgisi alınamadı veya katalog boş.</p>
              )}
            </ExactDataCard>
          </div>
        ) : null}
      </ExactWorkspaceModal>

      <ExactWorkspaceModal
        open={Boolean(editor)}
        onClose={requestEditorClose}
        title={editor?.mode === "edit" ? "Meta kataloğunu düzenle" : "Yeni Meta kataloğu"}
        subtitle={editor?.mode === "edit"
          ? "Katalog adını Meta Business üzerinde günceller"
          : "Meta Business hesabında yeni ürün kataloğu oluşturur"}
      >
        <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-4">
          {saveError ? <InlineFeedback tone="danger" message={saveError} /> : null}

          <ExactDataCard title="Katalog bilgileri">
            <div className="space-y-4">
              <label className="block">
                <span className="ruth-type-label mb-1.5 block font-semibold text-muted">Katalog adı</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={100}
                  required
                  autoFocus
                  placeholder="Örn. ROSTA Coffee Co. Ürün Kataloğu"
                  className="ruth-type-control h-11 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-main outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
                />
              </label>

              <label className="block">
                <span className="ruth-type-label mb-1.5 block font-semibold text-muted">Katalog türü</span>
                <select
                  value={vertical}
                  onChange={(event) => setVertical(event.target.value)}
                  disabled={editor?.mode === "edit" || savePending}
                  className="ruth-type-control h-11 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-main outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
                >
                  {VERTICAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="ruth-type-caption mt-1.5 text-subtle">
                  Meta katalog türü oluşturulduktan sonra değiştirilemez; düzenleme ekranında yalnız ad güncellenir.
                </p>
              </label>
            </div>
          </ExactDataCard>

          <div className="flex justify-end gap-2">
            <ExactButton
              type="button"
              variant="secondary"
              onClick={requestEditorClose}
              disabled={savePending}
            >
              Vazgeç
            </ExactButton>
            <ExactButton
              type="submit"
              loading={savePending}
              disabled={name.trim().length < 2 || savePending}
            >
              {editor?.mode === "edit" ? "Değişiklikleri kaydet" : "Kataloğu oluştur"}
            </ExactButton>
          </div>
        </form>
      </ExactWorkspaceModal>
    </div>
  );
}
