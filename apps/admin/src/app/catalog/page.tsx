import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ExactCatalog } from "@/components/base44-exact/ExactCatalog";

export default function CatalogPage() {
  return <SaveLifecycleProvider><ExactCatalog /></SaveLifecycleProvider>;
}
