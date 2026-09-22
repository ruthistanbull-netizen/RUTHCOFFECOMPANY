import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ThemeEditorNonBlockingGuard } from "@/components/theme/ThemeEditorNonBlockingGuard";
import { ThemePreviewViewport } from "@/components/theme/ThemePreviewViewport";

export default function StorefrontPage() {
  return (
    <SaveLifecycleProvider>
      <ThemeEditorNonBlockingGuard />
      <ThemePreviewViewport />
    </SaveLifecycleProvider>
  );
}
