import type { Metadata } from "next";
import { AccountOrdersClient } from "@/components/auth/AccountOrdersClient";

export const metadata: Metadata = {
  title: "Siparişlerim",
  description: "ROSTA Coffee Co. siparişlerim sayfası.",
};

export default function AccountOrdersPage() {
  return <AccountOrdersClient />;
}
