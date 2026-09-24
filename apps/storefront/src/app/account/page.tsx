import type { Metadata } from "next";
import Link from "next/link";
import { AccountClient } from "@/components/auth/AccountClient";

export const metadata: Metadata = {
  title: "Hesabım",
  description: "ROSTA Coffee Co. hesap sayfası.",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <>
      <AccountClient />
      <div className="bg-carbon px-4 pb-24 text-center">
        <Link href="/account/privacy" className="text-sm text-cream underline underline-offset-4">
          Gizlilik ve iletişim tercihlerim
        </Link>
      </div>
    </>
  );
}
