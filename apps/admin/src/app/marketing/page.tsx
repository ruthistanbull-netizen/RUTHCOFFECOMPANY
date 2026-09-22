import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ExactMarketing } from "@/components/base44-exact/ExactMarketing";
import { ExactPurposeCoupons } from "@/components/base44-exact/ExactPurposeCoupons";

export default function MarketingPage() {
  return (
    <>
      <ExactPurposeCoupons />
      <SaveLifecycleProvider>
        <ExactMarketing />
      </SaveLifecycleProvider>
    </>
  );
}
