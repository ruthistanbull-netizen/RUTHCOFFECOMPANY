import type { Metadata } from "next";
import { AccountOrdersClient } from "@/components/auth/AccountOrdersClient";

export const metadata: Metadata = {
  title: "Siparişlerim",
  description: "Ruth Istanbul siparişlerim sayfası.",
};

export default function AccountOrdersPage() {
  return <AccountOrdersClient />;
}
