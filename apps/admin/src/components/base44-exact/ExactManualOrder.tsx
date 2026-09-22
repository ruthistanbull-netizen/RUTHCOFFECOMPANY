"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Minus,
  PackagePlus,
  Plus,
  Save,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
} from "lucide-react";
import { CopyButton, useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactField,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactEmptyState } from "./data";

type ProductVariant = {
  id: string;
  option_summary: string;
  price: number;
  stock?: number;
  image_url?: string | null;
  is_active?: boolean;
};
type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency?: string;
  main_image_url?: string | null;
  status?: string;
  product_variants?: ProductVariant[];
};
type DraftItem = {
  product_id: string;
  variant_id: string | null;
  product_slug: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};
type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  city: string;
  town: string;
  neighborhood: string;
  address: string;
  postalCode: string;
};
type CustomerResult = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  district?: string | null;
  is_member?: boolean;
  last_order_no?: string | null;
  address?: {
    city?: string | null;
    district?: string | null;
    address_line?: string | null;
  } | null;
};
type PaymentStatus = "pending" | "paid" | "cash_on_delivery";
type SalesChannel = "phone" | "whatsapp" | "instagram" | "store" | "other";

type ExactManualOrderProps = {
  hideNeighborhood?: boolean;
  onOrderCreated?: () => void;
  onOpenCreatedOrder?: () => void;
};

const emptyCustomer: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  city: "",
  town: "",
  neighborhood: "",
  address: "",
  postalCode: "",
};

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function normalizeItem(item: DraftItem): DraftItem {
  const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
  const unitPrice = Math.max(0, Number(item.unit_price || 0));
  return { ...item, quantity, unit_price: unitPrice, total_price: quantity * unitPrice };
}

function activeVariants(product: Product | null) {
  return (product?.product_variants || []).filter((variant) => variant.is_active !== false);
}

export function ExactManualOrder({
  hideNeighborhood = false,
  onOrderCreated,
  onOpenCreatedOrder,
}: ExactManualOrderProps = {}) {
  const router = useRouter();
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [customer, setCustomer] = useState<CustomerForm>(emptyCustomer);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [salesChannel, setSalesChannel] = useState<SalesChannel>("phone");
  const [shippingFee, setShippingFee] = useState("0");
  const [discountTotal, setDiscountTotal] = useState("0");
  const [note, setNote] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [paymentLink, setPaymentLink] = useState("");
  const [createdOrder, setCreatedOrder] = useState<{ id?: string; order_no?: string } | null>(null);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.total_price || 0), 0),
    [items],
  );
  const total = Math.max(0, subtotal + Number(shippingFee || 0) - Number(discountTotal || 0));
  const draftDirty = !createdOrder && (
    Object.values(customer).some((value) => value.trim().length > 0)
    || items.length > 0
    || paymentStatus !== "pending"
    || salesChannel !== "phone"
    || shippingFee !== "0"
    || discountTotal !== "0"
    || note.trim().length > 0
  );

  const searchCustomers = async (value: string) => {
    setCustomerQuery(value);
    if (value.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    try {
      const result = await adminRequest<{ customers?: CustomerResult[] }>(
        `/api/customers?q=${encodeURIComponent(value.trim())}`,
      );
      setCustomerResults((result.customers || []).slice(0, 12));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Müşteriler aranamadı.");
    } finally {
      setSearchingCustomers(false);
    }
  };

  const selectCustomer = (result: CustomerResult) => {
    setCustomer({
      name: result.full_name || "",
      email: result.email || "",
      phone: result.phone || "",
      city: result.address?.city || result.city || "",
      town: result.address?.district || result.district || "",
      neighborhood: "",
      address: result.address?.address_line || "",
      postalCode: "",
    });
    setCustomerQuery("");
    setCustomerResults([]);
    toast.success(`${result.full_name || "Müşteri"} sipariş formuna eklendi.`);
  };

  const searchProducts = async (value: string) => {
    setProductQuery(value);
    if (value.trim().length < 2) {
      setProducts([]);
      return;
    }
    setSearching(true);
    try {
      const result = await adminRequest<{ products?: Product[] }>(
        `/api/products?q=${encodeURIComponent(value.trim())}`,
      );
      setProducts((result.products || []).filter((product) => product.status !== "archived").slice(0, 20));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ürünler aranamadı.");
    } finally {
      setSearching(false);
    }
  };

  const addProduct = (product: Product, variant?: ProductVariant) => {
    const variantId = variant?.id || null;
    const key = `${product.id}:${variantId || "standard"}`;
    setItems((current) => {
      const index = current.findIndex(
        (item) => `${item.product_id}:${item.variant_id || "standard"}` === key,
      );
      if (index >= 0) {
        return current.map((item, itemIndex) => (
          itemIndex === index ? normalizeItem({ ...item, quantity: item.quantity + 1 }) : item
        ));
      }
      const price = Number(variant?.price ?? product.price ?? 0);
      return [
        ...current,
        normalizeItem({
          product_id: product.id,
          variant_id: variantId,
          product_slug: product.slug,
          product_name: product.name,
          variant_name: variant?.option_summary || null,
          quantity: 1,
          unit_price: price,
          total_price: price,
          image_url: variant?.image_url || product.main_image_url || null,
        }),
      ];
    });
    setProductQuery("");
    setProducts([]);
    setVariantProduct(null);
  };

  const chooseProduct = (product: Product) => {
    const variants = activeVariants(product);
    if (variants.length) {
      setProductQuery("");
      setProducts([]);
      setVariantProduct(product);
      return;
    }
    addProduct(product);
  };

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? normalizeItem({ ...item, ...patch }) : item
    )));
  };

  const discardDraft = useCallback(() => {
    setCustomer(emptyCustomer);
    setCustomerQuery("");
    setCustomerResults([]);
    setItems([]);
    setProductQuery("");
    setProducts([]);
    setVariantProduct(null);
    setNote("");
    setPaymentStatus("pending");
    setSalesChannel("phone");
    setShippingFee("0");
    setDiscountTotal("0");
  }, []);

  const validateDraft = useCallback(() => {
    if (!customer.name.trim()) {
      toast.error("Müşteri adı zorunlu.");
      return false;
    }
    if (!customer.phone.trim()) {
      toast.error("Telefon zorunlu.");
      return false;
    }
    if (!customer.email.trim()) {
      toast.error("E-posta zorunlu.");
      return false;
    }
    if (!customer.city.trim() || !customer.town.trim() || !customer.address.trim()) {
      toast.error("İl, ilçe ve açık adres zorunlu.");
      return false;
    }
    if (!items.length) {
      toast.error("Siparişe en az bir ürün ekle.");
      return false;
    }
    return true;
  }, [customer, items.length, toast]);

  const persistDraft = useCallback(async () => {
    const normalizedItems = items.map(normalizeItem);
    const currentSubtotal = normalizedItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
    const currentTotal = Math.max(0, currentSubtotal + Number(shippingFee || 0) - Number(discountTotal || 0));
    const payload = {
      source: "manual",
      imported_source: "manual",
      traffic_source: salesChannel,
      customer_name: customer.name.trim(),
      customer_email: customer.email.trim(),
      customer_phone: customer.phone.trim(),
      shipping_city: customer.city.trim(),
      shipping_town: customer.town.trim(),
      shipping_neighborhood: customer.neighborhood.trim() || null,
      shipping_postal_code: customer.postalCode.trim() || null,
      shipping_address_line: customer.address.trim(),
      shipping_address_text: [
        customer.neighborhood,
        customer.address,
        [customer.town, customer.city].filter(Boolean).join(" / "),
      ].filter(Boolean).join(", "),
      payment_status: paymentStatus === "cash_on_delivery" ? "pending" : paymentStatus,
      payment_method: paymentStatus === "cash_on_delivery"
        ? "cash_on_delivery"
        : paymentStatus === "paid"
          ? "manual_paid"
          : "manual_pending",
      status: paymentStatus === "paid" ? "created" : "awaiting_payment",
      subtotal: currentSubtotal,
      shipping_fee: Number(shippingFee || 0),
      discount_total: Number(discountTotal || 0),
      total_amount: currentTotal,
      currency: "TRY",
      admin_note: [`Satış kanalı: ${salesChannel}`, note.trim()].filter(Boolean).join(" · "),
      order_items: normalizedItems,
      items: normalizedItems,
    };

    try {
      const result = await adminRequest<{ order?: { id?: string; order_no?: string }; id?: string; order_no?: string }>(
        "/api/orders/manual",
        { method: "POST", body: JSON.stringify(payload) },
      );
      const order = result.order || result;
      setCreatedOrder(order);
      setPaymentLink("");
      onOrderCreated?.();
      toast.success(`Manuel sipariş${order.order_no ? ` #${order.order_no}` : ""} oluşturuldu.`);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Manuel sipariş oluşturulamadı.");
      return false;
    }
  }, [customer, discountTotal, items, note, onOrderCreated, paymentStatus, salesChannel, shippingFee, toast]);

  useSaveLifecycleSource({
    id: "manual-order-draft",
    dirty: draftDirty,
    validate: validateDraft,
    save: persistDraft,
    discard: discardDraft,
  });

  const createPaymentLink = async () => {
    if (!createdOrder?.id) {
      toast.error("Ödeme linki için sipariş kimliği bulunamadı.");
      return;
    }
    setLinkBusy(true);
    try {
      const result = await adminRequest<{ paymentLink?: string }>("/api/orders/manual", {
        method: "POST",
        body: JSON.stringify({ action: "create_payment_link", order_id: createdOrder.id }),
      });
      if (!result.paymentLink) throw new Error("Ödeme linki üretilemedi.");
      setPaymentLink(result.paymentLink);
      toast.success("Güvenli ödeme linki oluşturuldu.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ödeme linki oluşturulamadı.");
    } finally {
      setLinkBusy(false);
    }
  };

  const resetAll = () => {
    discardDraft();
    setCreatedOrder(null);
    setPaymentLink("");
  };

  const openCreatedOrder = () => {
    onOpenCreatedOrder?.();
    router.push(createdOrder?.id ? `/orders?order=${createdOrder.id}` : "/orders");
  };

  if (createdOrder) {
    return (
      <div className="mx-auto max-w-2xl py-10 animate-fade-in">
        <ExactDataCard>
          <div className="py-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success-foreground">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-main">Sipariş oluşturuldu</h1>
            <p className="mt-2 text-sm text-muted">
              {createdOrder.order_no ? `#${createdOrder.order_no}` : "Yeni manuel sipariş"} operasyon kuyruğuna eklendi.
            </p>

            {paymentStatus !== "paid" ? (
              <div className="mx-auto mt-6 max-w-lg rounded-[var(--radius-card)] bg-accent-soft p-4 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center radius-small bg-surface-primary text-accent"><Link2 className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-main">Müşteri ödeme linki</p><p className="mt-1 text-[11px] text-muted">Siparişi storefront ödeme ekranına bağlayan tek kullanımlık güvenli bağlantı oluştur.</p></div>
                </div>
                {!paymentLink ? (
                  <ExactButton className="mt-3 w-full" size="sm" onClick={() => void createPaymentLink()} loading={linkBusy}><Link2 className="h-4 w-4" /> Ödeme linki oluştur</ExactButton>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="break-all rounded-[var(--radius-small)] bg-surface-primary p-3 text-[11px] text-muted">{paymentLink}</div>
                    <div className="flex gap-2">
                      <CopyButton
                        value={paymentLink}
                        label="Ödeme linkini kopyala"
                        copiedLabel="Kopyalandı"
                        errorLabel="Kopyalanamadı"
                        onCopyError={(error) => toast.error(error.message)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main transition hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {(state, feedback) => <><Copy className="h-4 w-4" /> {state === "copied" ? "Kopyalandı" : feedback}</>}
                      </CopyButton>
                      <a href={paymentLink} target="_blank" rel="noreferrer" className="flex-1"><ExactButton size="sm" className="w-full"><ExternalLink className="h-4 w-4" /> Aç</ExactButton></a>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <ExactButton variant="secondary" onClick={resetAll}>Yeni sipariş oluştur</ExactButton>
              <ExactButton onClick={openCreatedOrder}>Siparişi aç</ExactButton>
            </div>
          </div>
        </ExactDataCard>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="manual-order">
      <ExactPageHeader
        title="Manuel Sipariş Oluştur"
        subtitle="Kayıtlı müşteri, katalog ürünü, varyant, özel fiyat, indirim ve ödeme linkiyle sipariş oluştur"
        actions={(
          <ExactButton variant="secondary" size="sm" onClick={() => void requestTransition(() => router.push("/orders"))} disabled={saving}>
            <ArrowLeft className="h-4 w-4" /> Siparişlere dön
          </ExactButton>
        )}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <ExactDataCard
            title="Kayıtlı Müşteri Ara"
            action={<Search className="h-4 w-4 text-accent" />}
            className="relative z-[70] !overflow-visible"
            bodyClassName="!overflow-visible"
          >
            <div className="relative z-[71]">
              <ExactSearchInput value={customerQuery} onChange={(value) => void searchCustomers(value)} placeholder="Ad, telefon, e-posta veya son sipariş no ara..." />
              {searchingCustomers ? <p className="mt-2 text-[10px] text-muted">Müşteriler aranıyor…</p> : null}
              {customerResults.length ? (
                <div className="absolute inset-x-0 top-full z-[200] mt-1 max-h-80 overflow-y-auto border border-border-subtle bg-surface-primary radius-control shadow-floating">
                  {customerResults.map((result) => (
                    <button key={result.id} type="button" onClick={() => selectCustomer(result)} className="flex min-h-11 w-full items-center gap-3 border-b border-border-subtle p-3 text-left last:border-0 hover:bg-accent-soft">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><UserRound className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-main">{result.full_name || "İsimsiz müşteri"}</p><p className="truncate text-[10px] text-muted">{result.email || result.phone || "İletişim yok"}{result.last_order_no ? ` · Son sipariş #${result.last_order_no}` : ""}</p></div>
                      {result.is_member ? <span className="rounded-full bg-success-soft px-2 py-1 text-[9px] font-semibold text-success-foreground">Üye</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </ExactDataCard>

          <ExactDataCard title="Müşteri ve Teslimat Bilgileri" action={<UserRound className="h-4 w-4 text-accent" />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <ExactField label="Ad soyad" required><input value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} className={exactFormInputClass} /></ExactField>
              <ExactField label="Telefon" required><input value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} className={exactFormInputClass} /></ExactField>
              <ExactField label="E-posta" required><input type="email" value={customer.email} onChange={(event) => setCustomer((current) => ({ ...current, email: event.target.value }))} className={exactFormInputClass} /></ExactField>
              <ExactField label="Satış kanalı"><select value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as SalesChannel)} className={exactFormInputClass}><option value="phone">Telefon</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option><option value="store">Mağaza</option><option value="other">Diğer</option></select></ExactField>
              <ExactField label="Şehir" required><input value={customer.city} onChange={(event) => setCustomer((current) => ({ ...current, city: event.target.value }))} className={exactFormInputClass} /></ExactField>
              <ExactField label="İlçe" required><input value={customer.town} onChange={(event) => setCustomer((current) => ({ ...current, town: event.target.value }))} className={exactFormInputClass} /></ExactField>
              {!hideNeighborhood ? <ExactField label="Mahalle"><input value={customer.neighborhood} onChange={(event) => setCustomer((current) => ({ ...current, neighborhood: event.target.value }))} className={exactFormInputClass} /></ExactField> : null}
              <ExactField label="Posta kodu"><input value={customer.postalCode} onChange={(event) => setCustomer((current) => ({ ...current, postalCode: event.target.value }))} className={exactFormInputClass} /></ExactField>
              <ExactField label="Açık adres" required className="sm:col-span-2"><textarea value={customer.address} onChange={(event) => setCustomer((current) => ({ ...current, address: event.target.value }))} className={`${exactFormInputClass} min-h-24`} /></ExactField>
            </div>
          </ExactDataCard>

          <ExactDataCard
            title="Sipariş Ürünleri"
            action={<ShoppingBag className="h-4 w-4 text-accent" />}
            className="relative z-[60] !overflow-visible"
            bodyClassName="!overflow-visible"
          >
            <div className="relative z-[61]">
              <ExactSearchInput value={productQuery} onChange={(value) => void searchProducts(value)} placeholder="Ürün adı veya slug ara..." />
              {searching ? <p className="mt-2 text-[10px] text-muted">Ürünler aranıyor…</p> : null}
              {products.length ? (
                <div className="absolute inset-x-0 top-full z-[190] mt-1 max-h-80 overflow-y-auto border border-border-subtle bg-surface-primary radius-control shadow-floating">
                  {products.map((product) => {
                    const variants = activeVariants(product);
                    return (
                      <button key={product.id} type="button" onClick={() => chooseProduct(product)} className="flex min-h-11 w-full items-center gap-3 border-b border-border-subtle p-3 text-left last:border-0 hover:bg-surface-secondary">
                        <div className="h-12 w-10 shrink-0 overflow-hidden bg-surface-tertiary radius-small">{product.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-subtle"><PackagePlus className="h-4 w-4" /></div>}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-main">{product.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{variants.length ? `${variants.length} varyant · seçmek için tıkla` : "Standart ürün"}</p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-main">{money(product.price, product.currency)}</span>
                        <Plus className="h-4 w-4 shrink-0 text-accent" />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              {items.length ? (
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <div
                      key={`${item.product_id}-${item.variant_id}-${index}`}
                      className="grid grid-cols-1 gap-3 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary p-3 md:grid-cols-[minmax(0,1fr)_auto_132px_auto] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-16 w-12 shrink-0 overflow-hidden bg-surface-tertiary radius-small">{item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-subtle"><PackagePlus className="h-4 w-4" /></div>}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-main">{item.product_name}</p>
                          <p className="mt-0.5 truncate text-[10px] text-muted">{item.variant_name || "Standart"}</p>
                          <p className="mt-1 text-xs font-semibold text-main">{money(item.total_price)}</p>
                        </div>
                      </div>

                      <div className="flex min-h-11 w-fit items-center gap-1 rounded-[var(--radius-small)] border border-border-subtle bg-surface-primary p-0.5 md:min-h-9">
                        <ExactIconButton icon={Minus} label="Azalt" variant="ghost" size="icon-sm" onClick={() => updateItem(index, { quantity: Math.max(1, item.quantity - 1) })} />
                        <input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} className="h-7 w-12 border-0 bg-transparent text-center text-xs font-semibold text-main outline-none" />
                        <ExactIconButton icon={Plus} label="Artır" variant="ghost" size="icon-sm" onClick={() => updateItem(index, { quantity: item.quantity + 1 })} />
                      </div>

                      <ExactField label="Birim fiyat">
                        <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} className={`${exactFormInputClass} w-full`} />
                      </ExactField>

                      <ExactIconButton icon={Trash2} label="Ürünü sil" variant="ghost" size="icon-sm" className="justify-self-start md:justify-self-end" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
                    </div>
                  ))}
                </div>
              ) : (
                <ExactEmptyState compact icon={Search} title="Henüz ürün eklenmedi" description="Yukarıdaki arama alanından ürün seç. Varyantlı ürünlerde seçim penceresi otomatik açılır." />
              )}
            </div>
          </ExactDataCard>

          <ExactDataCard title="Operasyon Notu"><textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${exactFormInputClass} min-h-28`} placeholder="Müşteri talebi, ölçü, teslimat veya satış bilgisi..." /></ExactDataCard>
        </div>

        <div className="space-y-3 xl:sticky xl:top-20">
          <ExactDataCard title="Sipariş Özeti">
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-muted">Ara toplam</span><strong className="text-main">{money(subtotal)}</strong></div>
              <ExactField label="Kargo ücreti"><input type="number" min="0" step="0.01" value={shippingFee} onChange={(event) => setShippingFee(event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="İndirim"><input type="number" min="0" step="0.01" value={discountTotal} onChange={(event) => setDiscountTotal(event.target.value)} className={exactFormInputClass} /></ExactField>
              <div className="flex justify-between border-t border-border-subtle pt-3"><span className="font-semibold text-main">Toplam</span><strong className="text-xl text-main">{money(total)}</strong></div>
            </div>
          </ExactDataCard>

          <ExactDataCard title="Ödeme ve Tahsilat">
            <ExactSegmentedControl value={paymentStatus} onChange={(value) => setPaymentStatus(value as PaymentStatus)} options={[{ value: "pending", label: "Link / Bekliyor" }, { value: "paid", label: "Ödendi" }, { value: "cash_on_delivery", label: "Kapıda" }]} />
            <p className="mt-3 text-[10px] leading-relaxed text-muted">Bekliyor seçeneğinde sipariş oluşturulduktan sonra müşteriye gönderilecek storefront ödeme linki üretilebilir.</p>
          </ExactDataCard>

          <ExactButton className="w-full" size="lg" onClick={() => void save()} loading={saving} disabled={!draftDirty}>
            <Save className="h-4 w-4" /> Siparişi Oluştur
          </ExactButton>
        </div>
      </div>

      <ExactFormModal
        open={Boolean(variantProduct)}
        onClose={() => setVariantProduct(null)}
        dismissalPolicy="light-dismiss"
        title={variantProduct ? `${variantProduct.name} · Varyant Seç` : "Varyant Seç"}
        subtitle="Siparişe eklemek istediğin varyantı seç."
        size="md"
        footer={<ExactButton variant="secondary" size="sm" onClick={() => setVariantProduct(null)}>Vazgeç</ExactButton>}
      >
        {variantProduct ? (
          <div className="space-y-2">
            {activeVariants(variantProduct).map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => addProduct(variantProduct, variant)}
                className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] border border-border-subtle bg-surface-primary p-3 text-left transition hover:border-accent hover:bg-accent-soft"
              >
                <div className="h-14 w-11 shrink-0 overflow-hidden bg-surface-tertiary radius-small">
                  {variant.image_url || variantProduct.main_image_url ? <img src={variant.image_url || variantProduct.main_image_url || ""} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-subtle"><PackagePlus className="h-4 w-4" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-main">{variant.option_summary || "Standart varyant"}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{variant.stock == null ? "Stok bilgisi yok" : `${Math.max(0, Number(variant.stock || 0))} adet stok`}</p>
                </div>
                <strong className="shrink-0 text-sm text-main">{money(variant.price, variantProduct.currency)}</strong>
              </button>
            ))}
          </div>
        ) : null}
      </ExactFormModal>
    </div>
  );
}
