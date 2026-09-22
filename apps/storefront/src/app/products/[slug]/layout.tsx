import type { ReactNode } from "react";
import { getProductPageWindow } from "@/data/productPageData";
import { jsonLd, SITE_URL } from "@/lib/seo";

export default async function ProductLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = (await getProductPageWindow(slug)).current;
  if (!product) return children;

  const itemListElement: Array<Record<string, unknown>> = [
    {
      "@type": "ListItem",
      position: 1,
      name: "ROSTA Coffee Co.",
      item: SITE_URL,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Ürünler",
      item: `${SITE_URL}/products`,
    },
  ];

  const categorySlug = product.category_slugs?.[0];
  const categoryName = product.category_names?.[0];
  if (categorySlug && categoryName) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: categoryName,
      item: `${SITE_URL}/category/${encodeURIComponent(categorySlug)}`,
    });
  }

  itemListElement.push({
    "@type": "ListItem",
    position: itemListElement.length + 1,
    name: product.name,
    item: `${SITE_URL}/products/${encodeURIComponent(product.slug)}`,
  });

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      {children}
    </>
  );
}
