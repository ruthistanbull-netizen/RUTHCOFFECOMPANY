import type { Metadata } from "next";
import { AccountPrivacyClient } from "@/components/auth/AccountPrivacyClient";

export const metadata: Metadata = {
  title: "Gizlilik ve İletişim Tercihleri",
  description: "ROSTA Coffee Co. hesap gizliliği ve iletişim tercihleri.",
  robots: { index: false, follow: false },
};

export default function AccountPrivacyPage() {
  return <AccountPrivacyClient />;
}
