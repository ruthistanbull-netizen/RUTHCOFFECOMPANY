import { Suspense } from "react";
import { ExactProductStudioV2 } from "@/components/base44-exact/ExactProductStudioV2";

export default function ProductStudioPage() {
  return (
    <Suspense fallback={null}>
      <ExactProductStudioV2 />
    </Suspense>
  );
}
