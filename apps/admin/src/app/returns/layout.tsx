import { Suspense, type ReactNode } from "react";
import { ReturnsDeepLinkBridge } from "@/components/ReturnsDeepLinkBridge";

export default function ReturnsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ReturnsDeepLinkBridge />
      </Suspense>
      {children}
    </>
  );
}
