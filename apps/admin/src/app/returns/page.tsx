import { Suspense } from "react";
import { ExactReturns } from "@/components/base44-exact/ExactReturns";

export default function ReturnsPage() {
  return (
    <Suspense fallback={null}>
      <ExactReturns />
    </Suspense>
  );
}
