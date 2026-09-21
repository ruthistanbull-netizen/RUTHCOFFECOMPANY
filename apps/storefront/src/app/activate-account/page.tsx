import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountActivationClient } from "@/components/auth/AccountActivationClient";

export const metadata: Metadata = {
  title: "Hesabını Aktifleştir",
  description: "Taşınan Ruth Istanbul hesabın için yeni şifre oluştur.",
};

export default function ActivateAccountPage() {
  return (
    <Suspense>
      <AccountActivationClient />
    </Suspense>
  );
}
