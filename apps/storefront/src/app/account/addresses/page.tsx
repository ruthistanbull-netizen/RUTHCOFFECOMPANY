import type { Metadata } from "next";
import { AddressClient } from "@/components/auth/AddressClient";

export const metadata: Metadata = {
  title: "Adreslerim",
  description: "ROSTA Coffee Co. kayıtlı adreslerim sayfası.",
};

export default function AccountAddressesPage() {
  return <AddressClient />;
}
