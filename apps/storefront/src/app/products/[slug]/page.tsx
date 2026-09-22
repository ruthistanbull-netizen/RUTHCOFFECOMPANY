import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  ProductDetailExperience,
  type ProductBrowserWindow,
} from "@/components/product/ProductDetailExperience";
import { getProductPageWindow } from "@/data/productPageData";
import { getProductPageWindowForSource } from "@/data/productNavigationContext";
import { productPrimaryDetailImageSrc } from "@/lib/productDisplayImage";
import { absoluteUrl, cleanSeoText, SITE_NAME, SITE_URL } from "@/lib/seo";
import type { Product } from "@/types/site";

export const revalidate = 300;

function description(product: Product) {
  return cleanSeoText(
    product.seo_description || product.short_description || product.description,
    `${product.name} | ROSTA COFFEE CO.`,
    160,
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const productWindow = await getProductPageWindow(slug);
  const product = productWindow.current;
  if (!product) return { title: "Ürün bulunamadı", robots: { index: false, follow: false } };

  const image = productPrimaryDetailImageSrc(product);
  const canonical = `${SITE_URL}/products/${encodeURIComponent(product.slug)}`;
  const summary = description(product);
  const seoTitle = cleanSeoText(product.seo_title, "", 70);
  const socialTitle = seoTitle || `${product.name} | ${SITE_NAME}`;
  const socialImage = image ? absoluteUrl(image) : undefined;

  return {
    title: seoTitle ? { absolute: seoTitle } : product.name,
    description: summary,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: socialTitle,
      description: summary,
      images: socialImage ? [{ url: socialImage, alt: product.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: summary,
      images: socialImage ? [socialImage] : undefined,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const source = cookieStore.get("ruth_product_source")?.value || "";
  const productWindow = await getProductPageWindowForSource(slug, source);
  if (!productWindow.current) return notFound();

  const initialWindow: ProductBrowserWindow = {
    previous: productWindow.previous,
    current: productWindow.current,
    next: productWindow.next,
    source: productWindow.source,
  };

  const adjacentProducts = [productWindow.next, productWindow.previous].filter(
    (value): value is Product => Boolean(value),
  );
  const current = productWindow.current;
  const image = productPrimaryDetailImageSrc(current);
  const stockAvailable = current.stock_status !== "out_of_stock";
  const canonical = `${SITE_URL}/products/${encodeURIComponent(current.slug)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: current.name,
    description: description(current),
    image: image ? [absoluteUrl(image)] : undefined,
    sku: current.product_code || current.variants?.[0]?.sku || current.sku || current.slug,
    brand: { "@type": "Brand", name: SITE_NAME },
    category: current.category_names?.length ? current.category_names.join(", ") : undefined,
    material: current.material || undefined,
    color: current.finish_color || undefined,
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: current.currency || "TRY",
      price: Number(current.price || 0).toFixed(2),
      availability: stockAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      {adjacentProducts.map((product) => (
        <link
          key={`data-${product.slug}`}
          rel="prefetch"
          href={`/api/products/${encodeURIComponent(product.slug)}/browser-window`}
        />
      ))}
      {adjacentProducts.map((product) => {
        const src = productPrimaryDetailImageSrc(product);
        return src ? (
          <link
            key={`image-${product.slug}`}
            rel="preload"
            as="image"
            href={src}
          />
        ) : null;
      })}
      <ProductDetailExperience initialWindow={initialWindow} />
    </>
  );
}
