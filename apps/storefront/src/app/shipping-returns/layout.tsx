import type { Metadata } from "next";
import { jsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  alternates: { canonical: "/shipping-returns" },
};

const returnPolicyStructuredData = {
  "@context": "https://schema.org",
  "@type": "OnlineStore",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  hasMerchantReturnPolicy: {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "TR",
    returnPolicyCountry: "TR",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    merchantReturnLink: `${SITE_URL}/shipping-returns`,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(returnPolicyStructuredData) }}
      />
      {children}
    </>
  );
}
