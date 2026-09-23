"use client";

import { AlertTriangle, Check, PackageSearch, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { formatMoney } from "@/lib/format";

type OrderItem = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  product_slug?: string | null;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

type PaidOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_amount: number;
  subtotal?: number | null;
  currency: string;
  created_at: string;
  order_items?: OrderItem[];
};

type ProductOption = {
  id: string;
  name: string;
  slug: string;
  price: number;
  main_image_url?: string | null;
  product_variants?: Array<{ id: string; option_summary: string; price: number; image_url?: string | null }>;
};

function normalizeItem(item: OrderItem): OrderItem {
  const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
  const unitPrice = Math.max(0, Number(item.unit_price || 0));
  return { ...item, quantity, unit_price: unitPrice, total_price: quantity * unitPrice };
}

export function ManualReturnLauncher() {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PaidOrder | null>(null);
  const [type, setType] = useState<"return" | "exchange">("return");
  const [returnMode, setReturnMode] = useState<"amount" | "items">("amount");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [exchangeItems, setExchangeItems] = useState<OrderItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    if (!open || orders.length) return;
    setLoading(true);
    setError(null);
    adminRequest<{ orders?: PaidOrder[] }>("/api/returns?range=all&picker=1", {
      force: true,
      ttlMs: 0,
      staleMs: 0,
      timeoutMs: 30_000,
    })
      .then((result) => setOrders(result.orders || []))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Siparişler alınamadı."))
      .finally(() => setLoading(false));
  }, [open, orders.length]);

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return orders.slice(0, 30);
    return orders.filter((order) => [order.order_no, order.customer_name, order.customer_email, order.customer_phone]
      .some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(needle))).slice(0, 50);
  }, [orders, query]);

  const chooseOrder = (order: PaidOrder) => {
    setSelected(order);
    setAmount(String(order.total_amount || ""));
    setSelectedItems([]);
    setExchangeItems([]);
    setReason("");
    setNotes("");
    setType("return");
    setReturnMode("amount");
    setProducts([]);
    setProductQuery("");
  };

  const toggleItem = (item: OrderItem) => {
    const key = item.id || `${item.product_id}-${item.variant_id}-${item.product_name}`;
    setSelectedItems((current) => current.some((entry) => (entry.id || `${entry.product_id}-${entry.variant_id}-${entry.product_name}`) === key)
      ? current.filter((entry) => (entry.id || `${entry.product_id}-${entry.variant_id}-${entry.product_name}`) !== key)
      : [...current, normalizeItem(item)]);
  };

  const searchProducts = async (value: string) => {
    setProductQuery(value);
    if (value.trim().length < 2) {
      setProducts([]);
      return;
    }
    try {
      const result = await adminRequest<{ products?: ProductOption[] }>(`/api/products?compact=1&q=${encodeURIComponent(value.trim())}`, { force: true, ttlMs: 0, staleMs: 0 });
      setProducts(result.products || []);
    } catch {
      setProducts([]);
    }
  };

  const addExchangeProduct = (product: ProductOption, variant?: NonNullable<ProductOption["product_variants"]>[number]) => {
    const unitPrice = Number(variant?.price ?? product.price ?? 0);
    setExchangeItems((current) => [...current, {
      product_id: product.id,
      variant_id: variant?.id || null,
      product_slug: product.slug,
      product_name: product.name,
      variant_name: variant?.option_summary || null,
      quantity: 1,
      unit_price: unitPrice,
      total_price: unitPrice,
      image_url: variant?.image_url || product.main_image_url || null,
    }]);
    setProductQuery("");
    setProducts([]);
  };

  const returnItemsTotal = selectedItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const exchangeTotal = exchangeItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const caseAmount = type === "exchange"
    ? Math.abs(exchangeTotal - Number(selected?.subtotal ?? selected?.total_amount ?? 0))
    : returnMode === "items" ? returnItemsTotal : Number(amount || 0);

  const createCase = async () => {
    if (!selected) return;
    if (!reason.trim()) {
      setError("İade veya değişim sebebi zorunlu.");
      return;
    }
    if (type === "return" && returnMode === "items" && !selectedItems.length) {
      setError("İade edilecek en az bir ürün seç.");
      return;
    }
    if (type === "exchange" && !exchangeItems.length) {
      setError("Değişim için gönderilecek en az bir ürün seç.");
      return;
    }
    if (type === "return" && caseAmount <= 0) {
      setError("Geçerli bir iade tutarı gir.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await adminRequest("/api/returns", {
        method: "POST",
        body: JSON.stringify({
          order_id: selected.id,
          type,
          return_mode: returnMode,
          reason: reason.trim(),
          notes: notes.trim(),
          amount: caseAmount,
          selected_items: selectedItems,
          exchange_items: exchangeItems,
        }),
      });
      setOpen(false);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Manuel vaka oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        .cr-manual-return-launcher{position:fixed;top:92px;right:28px;z-index:45}.cr-manual-return-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:22px;overflow:hidden}.cr-manual-return-backdrop{position:absolute;inset:0;border:0;background:rgba(18,15,12,.52);backdrop-filter:blur(7px)}.cr-manual-return-dialog{position:relative;width:min(760px,100%);max-width:100%;min-width:0;max-height:calc(100dvh - 44px);overflow-y:auto;overflow-x:hidden;border:1px solid rgba(184,151,106,.25);border-radius:26px;background:var(--cream,#fbf7ef);box-shadow:0 30px 90px rgba(0,0,0,.25)}.cr-manual-return-dialog>header{position:sticky;top:0;z-index:3;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;min-width:0;padding:22px 24px;border-bottom:1px solid rgba(35,27,20,.1);background:rgba(251,247,239,.96);backdrop-filter:blur(18px)}.cr-manual-return-dialog>header>div{min-width:0}.cr-manual-return-body{display:grid;gap:18px;min-width:0;padding:22px 24px 28px}.cr-manual-order-results{display:grid;gap:8px;width:100%;min-width:0;max-height:320px;overflow-y:auto;overflow-x:hidden}.cr-manual-order-results button{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;width:100%;min-width:0;gap:16px;padding:14px;border:1px solid rgba(35,27,20,.1);border-radius:16px;background:#fff;text-align:left}.cr-manual-order-results button span{display:grid;min-width:0;gap:3px}.cr-manual-order-results button span strong{max-width:100%;overflow-wrap:anywhere;word-break:break-word}.cr-manual-order-results button>strong{white-space:nowrap}.cr-manual-order-results small{min-width:0;color:#756f68;overflow-wrap:anywhere}.cr-manual-selected-order{min-width:0;padding:15px 17px;border:1px solid rgba(184,151,106,.3);border-radius:18px;background:#fff}.cr-manual-selected-order>div{display:flex;align-items:center;justify-content:space-between;min-width:0;gap:12px}.cr-manual-selected-order span{min-width:0;overflow-wrap:anywhere}.cr-manual-item-list,.cr-manual-exchange-list{display:grid;min-width:0;gap:8px}.cr-manual-item-list button,.cr-manual-exchange-list article{display:flex;align-items:center;min-width:0;gap:12px;padding:12px;border:1px solid rgba(35,27,20,.1);border-radius:14px;background:#fff;text-align:left}.cr-manual-item-list button.is-selected{border-color:var(--gold-dark);box-shadow:inset 0 0 0 1px var(--gold-dark)}.cr-manual-item-list img,.cr-manual-exchange-list img{width:44px;height:56px;border-radius:8px;object-fit:cover}.cr-manual-item-list div,.cr-manual-exchange-list div{min-width:0;flex:1;display:grid;gap:3px}.cr-manual-product-results{display:grid;gap:8px;max-height:260px;overflow:auto}.cr-manual-product-results article{display:grid;min-width:0;gap:8px;padding:12px;border:1px solid rgba(35,27,20,.1);border-radius:14px;background:#fff}.cr-manual-product-results article>div{display:flex;align-items:center;min-width:0;gap:10px}.cr-manual-product-results img{width:42px;height:52px;border-radius:8px;object-fit:cover}.cr-manual-product-actions{display:flex;flex-wrap:wrap;gap:7px}.cr-manual-form-actions{display:flex;justify-content:flex-end;gap:10px;padding-top:6px}@media(max-width:767px){.cr-manual-return-launcher{top:auto;right:14px;bottom:82px}.cr-manual-return-launcher .cr-button{min-height:46px;font-size:11px}.cr-manual-return-modal{padding:8px}.cr-manual-return-dialog{width:calc(100vw - 16px);max-height:calc(100dvh - 16px);border-radius:20px}.cr-manual-return-dialog>header,.cr-manual-return-body{padding:18px 16px}.cr-manual-order-results button{grid-template-columns:minmax(0,1fr);gap:8px}.cr-manual-order-results button>strong{justify-self:start}.cr-manual-selected-order>div{align-items:flex-start;flex-direction:column}.cr-manual-form-actions{position:sticky;bottom:0;padding:12px 0;background:var(--cream,#fbf7ef)}}
      `}</style>

      <div className="cr-manual-return-launcher">
        <button className="cr-button cr-button--primary" type="button" onClick={() => setOpen(true)}><Plus /> Manuel iade/değişim oluştur</button>
      </div>

      {open ? (
        <div className="cr-manual-return-modal" role="dialog" aria-modal="true">
          <button className="cr-manual-return-backdrop" type="button" onClick={() => !busy && setOpen(false)} aria-label="Pencereyi kapat" />
          <section className="cr-manual-return-dialog">
            <header>
              <div><span className="cr-eyebrow">Manuel satış sonrası işlem</span><h2>İade veya değişim oluştur</h2><p>Siparişi seç, vaka ayrıntılarını gir ve doğrudan operasyon listesine ekle.</p></div>
              <button className="cr-icon-button" type="button" onClick={() => setOpen(false)} disabled={busy}><X /></button>
            </header>
            <div className="cr-manual-return-body">
              {error ? <div className="cr-notice cr-notice--danger"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => setError(null)}><X /></button></div> : null}

              {!selected ? (
                <>
                  <label className="cr-search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sipariş no, müşteri, telefon veya e-posta" />{query ? <button type="button" onClick={() => setQuery("")}><X /></button> : null}</label>
                  {loading ? <div className="cr-loading"><span className="cr-spinner" /><strong>Siparişler yükleniyor</strong></div> : null}
                  {!loading && visibleOrders.length === 0 ? <div className="cr-empty"><RotateCcw /><strong>Gösterilecek sipariş bulunamadı</strong></div> : null}
                  {!loading && visibleOrders.length > 0 ? <div className="cr-manual-order-results">{visibleOrders.map((order) => <button type="button" key={order.id} onClick={() => chooseOrder(order)}><span><strong>#{order.order_no}</strong><small>{order.customer_name} · {order.customer_phone || order.customer_email || "İletişim yok"}</small></span><strong>{formatMoney(order.total_amount, order.currency)}</strong></button>)}</div> : null}
                </>
              ) : (
                <>
                  <div className="cr-manual-selected-order"><div><span><small>Seçili sipariş</small><strong>#{selected.order_no} · {selected.customer_name}</strong></span><button className="cr-button cr-button--secondary" type="button" onClick={() => setSelected(null)} disabled={busy}>Değiştir</button></div></div>

                  <div className="cr-return-form-grid">
                    <label className="cr-field"><span>İşlem tipi</span><select value={type} onChange={(event) => setType(event.target.value === "exchange" ? "exchange" : "return")}><option value="return">İade</option><option value="exchange">Değişim</option></select></label>
                    {type === "return" ? <label className="cr-field"><span>İade şekli</span><select value={returnMode} onChange={(event) => setReturnMode(event.target.value === "items" ? "items" : "amount")}><option value="amount">Tutar iadesi</option><option value="items">Ürün iadesi</option></select></label> : null}
                    {type === "return" && returnMode === "amount" ? <label className="cr-field"><span>İade tutarı</span><input type="number" min="0" max={selected.total_amount} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label> : null}
                    <label className="cr-field cr-field--wide"><span>Sebep</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Müşteri talebi, hasar, ölçü veya değişim" /></label>
                    <label className="cr-field cr-field--wide"><span>Operasyon notu</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
                  </div>

                  {type === "return" && returnMode === "items" ? <div className="cr-manual-item-list"><strong>İade edilecek ürünleri seç</strong>{(selected.order_items || []).map((item) => { const active = selectedItems.some((entry) => (entry.id || entry.product_id) === (item.id || item.product_id)); return <button type="button" className={active ? "is-selected" : ""} key={item.id || `${item.product_name}-${item.variant_name}`} onClick={() => toggleItem(item)}>{item.image_url ? <img src={item.image_url} alt="" /> : <RotateCcw />}<div><strong>{item.product_name}</strong><small>{item.variant_name || "Standart"} · {item.quantity} adet</small></div><strong>{formatMoney(item.total_price, selected.currency)}</strong></button>; })}<div className="cr-return-total"><span>Seçili toplam</span><strong>{formatMoney(returnItemsTotal, selected.currency)}</strong></div></div> : null}

                  {type === "exchange" ? <div className="cr-exchange-builder"><label className="cr-search-field"><PackageSearch /><input value={productQuery} onChange={(event) => void searchProducts(event.target.value)} placeholder="Gönderilecek yeni ürünü ara" />{productQuery ? <button type="button" onClick={() => { setProductQuery(""); setProducts([]); }}><X /></button> : null}</label>{products.length ? <div className="cr-manual-product-results">{products.map((product) => <article key={product.id}><div>{product.main_image_url ? <img src={product.main_image_url} alt="" /> : <PackageSearch />}<span><strong>{product.name}</strong><small>{formatMoney(product.price, selected.currency)}</small></span></div><div className="cr-manual-product-actions"><button className="cr-button cr-button--secondary" type="button" onClick={() => addExchangeProduct(product)}><Plus /> Standart</button>{(product.product_variants || []).map((variant) => <button className="cr-button cr-button--secondary" type="button" key={variant.id} onClick={() => addExchangeProduct(product, variant)}><Plus /> {variant.option_summary}</button>)}</div></article>)}</div> : null}<div className="cr-manual-exchange-list">{exchangeItems.map((item, index) => <article key={`${item.product_id}-${item.variant_id}-${index}`}>{item.image_url ? <img src={item.image_url} alt="" /> : <PackageSearch />}<div><strong>{item.product_name}</strong><small>{item.variant_name || "Standart"}</small></div><label className="cr-field"><span>Adet</span><input type="number" min="1" value={item.quantity} onChange={(event) => setExchangeItems((current) => current.map((entry, itemIndex) => itemIndex === index ? normalizeItem({ ...entry, quantity: Number(event.target.value) }) : entry))} /></label><strong>{formatMoney(item.total_price, selected.currency)}</strong><button className="cr-icon-button cr-icon-button--danger" type="button" onClick={() => setExchangeItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X /></button></article>)}</div><div className="cr-return-total"><span>Yeni ürün toplamı / fark</span><strong>{formatMoney(exchangeTotal, selected.currency)} · Fark {formatMoney(caseAmount, selected.currency)}</strong></div></div> : null}

                  <div className="cr-manual-form-actions"><button className="cr-button cr-button--secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button><button className="cr-button cr-button--primary" type="button" onClick={() => void createCase()} disabled={busy}>{busy ? <span className="cr-spinner cr-spinner--small" /> : <Check />} Vakayı oluştur</button></div>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
