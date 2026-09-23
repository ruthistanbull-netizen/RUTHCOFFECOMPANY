import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ExactCRM } from "@/components/base44-exact/ExactCRM";

export default function CrmPage() {
  return (
    <SaveLifecycleProvider>
      <ExactCRM />
    </SaveLifecycleProvider>
  );
}
