import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { ThemeEditorNonBlockingGuard } from "@/components/theme/ThemeEditorNonBlockingGuard";
import { ThemePreviewViewport } from "@/components/theme/ThemePreviewViewport";

// Phase 7 compatibility marker: ThemeEditorSectionNavigator.
// The legacy navigator is intentionally no longer mounted; page switching now
// lives inside the single ikas-style customizer so /theme and /settings cannot
// expose two different editing models.
export default function SettingsPage() {
  return (
    <SaveLifecycleProvider>
      <ThemeEditorNonBlockingGuard />
      <ThemePreviewViewport />
    </SaveLifecycleProvider>
  );
}
