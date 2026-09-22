import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordClient } from "@/components/auth/ResetPasswordClient";

export const metadata: Metadata = {
  title: "Şifremi Unuttum",
  description: "ROSTA Coffee Co. hesabın için şifre yenileme bağlantısı iste veya yeni şifreni belirle.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordClient />
    </Suspense>
  );
}
