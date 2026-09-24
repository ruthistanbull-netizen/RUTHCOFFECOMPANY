"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminDesktopBrandScaleV2 } from "@/components/AdminDesktopBrandScaleV2";
import { AdminInterfacePolishV2 } from "@/components/AdminInterfacePolishV2";
import { AdminLiveDataBoundary } from "@/components/AdminLiveDataBoundary";
import { AdminPanelHubEntryGuard } from "@/components/AdminPanelHubEntryGuard";
import { AdminMobileQuarterMenu } from "@/components/AdminMobileQuarterMenu";
import { AdminMobileQuarterMenuPolish } from "@/components/AdminMobileQuarterMenuPolish";
import { AdminMobileNavPolishV2 } from "@/components/AdminMobileNavPolishV2";
import { AdminMobileRefreshThemeFix } from "@/components/AdminMobileRefreshThemeFix";
import { AdminMobileUiPolish } from "@/components/AdminMobileUiPolish";
import { AdminNativeSelectPickerBridge } from "@/components/AdminNativeSelectPickerBridge";
import { AdminNavigationRecovery } from "@/components/AdminNavigationRecovery";
import { AdminNotificationSounds } from "@/components/AdminNotificationSounds";
import { AdminOrderDateFilterEnhancer } from "@/components/AdminOrderDateFilterEnhancer";
import { AdminPageRefreshTransition } from "@/components/AdminPageRefreshTransition";
import { AdminPerformanceBootstrap } from "@/components/AdminPerformanceBootstrap";
import { AdminProductMediaMobileStackV2 } from "@/components/AdminProductMediaMobileStackV2";
import { AdminProductStudioResponsiveEnhancer } from "@/components/AdminProductStudioResponsiveEnhancer";
import { AdminRefreshButtonCleaner } from "@/components/AdminRefreshButtonCleaner";
import { AdminRetainedLiquidClass } from "@/components/AdminRetainedLiquidClass";
import { AdminRouteViewTransition } from "@/components/AdminRouteViewTransition";
import { AdminRuthieQuickChatV2 } from "@/components/AdminRuthieQuickChatV2";
import { AdminSingleNavigationGuard } from "@/components/AdminSingleNavigationGuard";
import { AdminUnifiedMotionEnhancer } from "@/components/AdminUnifiedMotionEnhancer";
import { OrderProductLightboxEnhancer } from "@/components/OrderProductLightboxEnhancer";
import { RequireAdmin } from "@/components/RequireAdmin";
import { RuthieRealtimeProtocolGuard } from "@/components/RuthieRealtimeProtocolGuard";
import { ExactBase44ShellV2 } from "@/components/base44-exact/ExactBase44ShellV2";
import { ExactDateTimeEnhancer } from "@/components/base44-exact/ExactDateTimeEnhancer";

const PUBLIC_AUTH_ROUTES = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (PUBLIC_AUTH_ROUTES.has(pathname)) return <>{children}</>;

  const providers = (
    <>
      <AdminNavigationRecovery />
      <AdminNotificationSounds />
      <AdminPerformanceBootstrap />
      <AdminRefreshButtonCleaner />
      <ExactDateTimeEnhancer />
      <OrderProductLightboxEnhancer />
      <AdminOrderDateFilterEnhancer />
      <AdminProductStudioResponsiveEnhancer />
      <AdminProductMediaMobileStackV2 />
      <AdminDesktopBrandScaleV2 />
      <AdminInterfacePolishV2 />
      <AdminMobileNavPolishV2 />
      <AdminMobileRefreshThemeFix />
      <AdminMobileUiPolish />
      <AdminNativeSelectPickerBridge />
      <AdminMobileQuarterMenuPolish />
      <AdminUnifiedMotionEnhancer />
    </>
  );

  if (pathname === "/ruth") {
    return (
      <RequireAdmin>
        <div
          data-ruth-workspace-immersive-root
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483500,
            width: "100vw",
            height: "100dvh",
            minHeight: "100dvh",
            overflow: "hidden",
            transform: "none",
            background: "#141414",
          }}
        >
          {children}
        </div>
      </RequireAdmin>
    );
  }

  if (pathname === "/profiles") {
    return (
      <RequireAdmin>
        <div
          data-panel-hub-immersive-root
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            width: "100vw",
            height: "100dvh",
            minHeight: "100dvh",
            overflow: "auto",
            transform: "none",
            background: "#141414",
          }}
        >
          {children}
        </div>
      </RequireAdmin>
    );
  }

  if (pathname === "/rosta-insight" || pathname.startsWith("/rosta-insight/") || pathname === "/ruthie" || pathname.startsWith("/ruthie/")) {
    return (
      <AdminPanelHubEntryGuard>
      <RequireAdmin>
        {providers}
        <RuthieRealtimeProtocolGuard />
        <div
          data-ruthie-immersive-root
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            width: "100vw",
            height: "100dvh",
            minHeight: "100dvh",
            overflow: "hidden",
            transform: "none",
          }}
        >
          {children}
        </div>
      </RequireAdmin>
      </AdminPanelHubEntryGuard>
    );
  }

  if (pathname === "/theme" || pathname === "/settings") {
    return (
      <AdminPanelHubEntryGuard>
      <RequireAdmin>
        {providers}
        <div
          data-theme-editor-immersive-root
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            width: "100vw",
            height: "100dvh",
            minHeight: "100dvh",
            overflow: "hidden",
            transform: "none",
          }}
        >
          {children}
        </div>
      </RequireAdmin>
      </AdminPanelHubEntryGuard>
    );
  }

  return (
    <AdminPanelHubEntryGuard>
    <RequireAdmin>
      {providers}
      <AdminPageRefreshTransition />
      <AdminRouteViewTransition />
      <AdminRetainedLiquidClass />
      <AdminSingleNavigationGuard />
      <AdminRuthieQuickChatV2 />
      <AdminMobileQuarterMenu />
      <ExactBase44ShellV2><AdminLiveDataBoundary>{children}</AdminLiveDataBoundary></ExactBase44ShellV2>
    </RequireAdmin>
    </AdminPanelHubEntryGuard>
  );
}
