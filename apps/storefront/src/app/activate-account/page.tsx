import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountActivationClient } from "@/components/auth/AccountActivationClient";

export const metadata: Metadata = {
  title: "Hesabını Aktifleştir",
  description: "ROSTA Coffee Co. hesabın için yeni şifre oluştur.",
};

export default function ActivateAccountPage() {
  return (
    <Suspense>
      <AccountActivationClient />
    </Suspense>
  );
}
