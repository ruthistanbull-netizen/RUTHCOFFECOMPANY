import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ExactManualOrderHost } from "@/components/base44-exact/ExactManualOrderHost";

export default function ManualOrderPage() {
  return (
    <SaveLifecycleProvider>
      <ExactManualOrderHost />
    </SaveLifecycleProvider>
  );
}
