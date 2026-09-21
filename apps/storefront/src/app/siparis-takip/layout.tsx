import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/siparis-takip" },
  robots: { index: false, follow: true, noarchive: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
