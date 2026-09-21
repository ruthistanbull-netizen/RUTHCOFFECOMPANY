import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/types/site";

export default function FeaturedProducts({ products }: { products: Product[] }) {
  const visibleProducts = products.slice(0, 8);

  return (
    <section className="home-featured-products bg-cream px-0 py-16 sm:px-4 md:px-8 md:py-28">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-9 flex items-end justify-between gap-4 px-3 md:mb-14 md:px-0">
          <div>
            <p className="mb-3 text-[10px] uppercase tracking-wide-luxe text-gold-dark">
              Ruth Atelier
            </p>
            <h2
              className="font-heading"
              style={{
                fontSize: "clamp(1.55rem, 3.2vw, 2.8rem)",
                color: "var(--ink)",
              }}
            >
              Öne Çıkarılan Ürünler
            </h2>
          </div>
          <Link
            href="/collections/ruth-atelier"
            className="shrink-0 pb-1 text-[9px] uppercase tracking-[0.14em] text-gold-dark transition hover:text-ink sm:text-xs sm:tracking-wide-luxe"
          >
            Tümünü Gör
          </Link>
        </div>

        <div className="home-featured-products-rail">
          {visibleProducts.map((product, index) => (
            <div className="home-featured-product-card" key={product.id}>
              <ProductCard
                product={product}
                index={index}
                showShortDescription={false}
              />
            </div>
          ))}
        </div>

        {visibleProducts.length === 0 && (
          <div className="rounded-2xl border border-gold/15 bg-ivory p-8 text-center text-sm text-muted-ruth">
            Öne çıkarılan ürün bulunamadı.
          </div>
        )}
      </div>

      <style>{`
        .home-featured-products-rail {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 48px 6px;
        }

        .home-featured-product-card {
          min-width: 0;
        }

        @media (max-width: 767px) {
          .home-featured-products-rail {
            display: flex;
            width: 100%;
            gap: 5px;
            overflow-x: auto;
            overflow-y: hidden;
            padding: 0 6px 10px;
            scroll-padding-inline: 6px;
            scroll-snap-type: x proximity;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
          }

          .home-featured-products-rail::-webkit-scrollbar {
            display: none;
          }

          .home-featured-product-card {
            flex: 0 0 calc((100% - 10px) / 3);
            width: calc((100% - 10px) / 3);
            scroll-snap-align: start;
          }

          .home-featured-product-card :where(.product-card-collection) {
            font-size: 7px !important;
            letter-spacing: 0.1em !important;
          }

          .home-featured-product-card :where(.product-card-name) {
            font-size: 9.5px !important;
            line-height: 1.22 !important;
          }

          .home-featured-product-card :where(.product-card-current, .product-card-sale-pill strong) {
            font-size: 10px !important;
          }

          .home-featured-product-card :where(.product-card-compare) {
            font-size: 8px !important;
          }
        }

        @media (min-width: 768px) {
          .home-featured-products-rail {
            gap: 80px 20px;
          }
        }
      `}</style>
    </section>
  );
}
