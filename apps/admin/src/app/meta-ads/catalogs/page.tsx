import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ExactMetaCatalogs } from "@/components/base44-exact/ExactMetaCatalogs";

export default function MetaCatalogsPage() {
  return (
    <SaveLifecycleProvider>
      <ExactMetaCatalogs />
    </SaveLifecycleProvider>
  );
}
