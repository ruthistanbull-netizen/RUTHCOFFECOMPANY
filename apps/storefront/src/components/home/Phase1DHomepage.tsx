import Link from "next/link";
import {
  ButtonLink,
  EditorialCard,
  PageSection,
  StatusBadge,
} from "@ruth-commerce/ui";
import ProductCard from "@/components/ProductCard";
import type { Category, Collection, Product } from "@/types/site";
import { categoryHref } from "@/lib/catalogCategories";

type HomepageTheme = {
  homepageImages?: {
    heroImage?: string;
    scrollImages?: string[];
  };
};

type Props = {
  newProducts: Product[];
  editorialProducts: Product[];
  categories: Category[];
  collections: Collection[];
  themeSettings: HomepageTheme;
};

function productImage(product?: Product | null) {
  return product?.main_image_url || product?.image_urls?.[0] || "";
}

function Media({ src, alt = "" }: { src?: string | null; alt?: string }) {
  return src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <span className="ruth-card-gradient" aria-hidden="true" />;
}

export function Phase1DHomepage({ newProducts, editorialProducts, categories, collections, themeSettings }: Props) {
  const heroProduct = editorialProducts[0] || newProducts[0] || null;
  const heroImage = themeSettings.homepageImages?.heroImage || productImage(heroProduct);
  const scrollImages = (themeSettings.homepageImages?.scrollImages || []).filter(Boolean);
  const storyImage = scrollImages[0] || productImage(editorialProducts[1]) || heroImage;
  const objectImage = scrollImages[1] || productImage(editorialProducts[2]) || productImage(newProducts[1]);
  const categoryFallbacks = [...editorialProducts, ...newProducts];

  return (
    <div className="phase1d-home">
      <section className="phase1d-home-hero" aria-labelledby="phase1d-home-title">
        <div className="phase1d-home-hero__media">
          <Media src={heroImage} alt="Ruth Istanbul koleksiyonu" />
        </div>
        <div className="phase1d-home-hero__overlay" aria-hidden="true" />
        <div className="phase1d-home-hero__content">
          <p>Ruth Istanbul · İstanbul</p>
          <h1 id="phase1d-home-title" lang="en-US" data-latin-uppercase>Ancient forms.<br />Modern rituals.</h1>
          <span>Mitolojiden ilham alan, günlük yaşama uyarlanan zamansız takılar.</span>
          <div className="phase1d-home-hero__actions">
            <ButtonLink href="/products">Koleksiyonu Keşfet</ButtonLink>
            <ButtonLink href="/collections" variant="secondary">Hikâyeleri Gör</ButtonLink>
          </div>
        </div>
        <div className="phase1d-home-hero__index" aria-hidden="true">R · 01</div>
      </section>

      <PageSection
        className="phase1d-home-section phase1d-home-new"
        eyebrow="New arrivals"
        title="Yeni parçalar"
        description="Yeni eklenen Ruth tasarımları; sakin, heykelsi ve günlük kullanıma hazır."
        actions={<ButtonLink href="/category/new-arrivals" variant="secondary">Tüm Yeni Gelenler</ButtonLink>}
      >
        <div className="phase1d-home-product-grid">
          {newProducts.slice(0, 4).map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>
      </PageSection>

      <section className="phase1d-home-signature phase1d-home-section">
        <div className="phase1d-home-signature__media">
          <Media src={storyImage} alt={editorialProducts[0]?.name || "Ruth Istanbul signature object"} />
          <span aria-hidden="true">01</span>
        </div>
        <div className="phase1d-home-signature__copy">
          <p>Signature object</p>
          <h2>{editorialProducts[0]?.name || "The object of ritual"}</h2>
          <span>{editorialProducts[0]?.short_description || editorialProducts[0]?.description || "Kadim sembollerin modern formda yeniden yorumlandığı seçili Ruth parçası."}</span>
          {editorialProducts[0] ? (
            <ButtonLink href={`/products/${editorialProducts[0].slug}`} variant="secondary">Parçayı İncele</ButtonLink>
          ) : <ButtonLink href="/products" variant="secondary">Ürünleri İncele</ButtonLink>}
        </div>
      </section>

      <PageSection
        className="phase1d-home-section"
        eyebrow="Shop by form"
        title="Formuna göre keşfet"
        description="Aynı katalog standardıyla kategoriler arasında hızlı ve görsel bir geçiş."
        actions={<StatusBadge tone="info">{categories.length} kategori</StatusBadge>}
      >
        <div className="phase1d-home-category-grid">
          {categories.slice(0, 6).map((category, index) => (
            <EditorialCard
              key={category.id}
              href={categoryHref(category.public_slug || category.slug)}
              eyebrow={String(index + 1).padStart(2, "0")}
              title={category.name}
              description={category.description || "Ruth Istanbul seçili ürün formu."}
              media={<Media src={category.cover_image_url || productImage(categoryFallbacks[index])} />}
            />
          ))}
        </div>
      </PageSection>

      <section className="phase1d-home-manifesto">
        <div className="phase1d-home-manifesto__copy phase1d-home-section">
          <p>Ruth manifesto</p>
          <h2>Takı yalnız görünen değil, taşıdığın anlamdır.</h2>
          <span>Her form; geçmişten gelen bir sembolü, bugünün sade ritmiyle buluşturur. Ruth Istanbul parçaları hızlı tüketim için değil, kişisel hikâyenin parçası olmak için tasarlanır.</span>
          <ButtonLink href="/pages/about" variant="secondary">Ruth’u Tanı</ButtonLink>
        </div>
        <div className="phase1d-home-manifesto__media">
          <Media src={objectImage} alt="Ruth Istanbul tasarım detayı" />
        </div>
      </section>

      <PageSection
        className="phase1d-home-section phase1d-home-collections"
        eyebrow="Curated stories"
        title="Koleksiyonlar"
        description="Bir sembol, bir anlatı ve bir arada düşünülen parçalar."
        actions={<ButtonLink href="/collections" variant="secondary">Tüm Koleksiyonlar</ButtonLink>}
      >
        <div className="phase1d-home-collection-grid">
          {collections.slice(0, 4).map((collection, index) => (
            <Link key={collection.id} href={`/collections/${collection.slug}`} className="phase1d-home-collection-card">
              <Media src={collection.cover_image_url || scrollImages[index + 2] || productImage(editorialProducts[index])} alt={collection.name} />
              <span className="phase1d-home-collection-card__overlay" aria-hidden="true" />
              <span className="phase1d-home-collection-card__copy">
                <small>{String(index + 1).padStart(2, "0")} · Collection</small>
                <strong>{collection.name}</strong>
                <em>{collection.description || "Koleksiyonu keşfet"}</em>
              </span>
            </Link>
          ))}
        </div>
      </PageSection>

      <section className="phase1d-home-service phase1d-home-section" aria-label="Ruth Istanbul hizmetleri">
        {[
          ["01", "Güvenli ödeme", "PayTR korumalı ödeme akışı"],
          ["02", "Üretim ve gönderim", "3–5 iş gününde kargoya teslim"],
          ["03", "İade ve değişim", "14 gün satış sonrası destek"],
        ].map(([index, title, text]) => (
          <div key={index}>
            <small>{index}</small>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
