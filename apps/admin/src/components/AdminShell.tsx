"use client";

import type { ReactNode } from "react";
import { AdminDesktopBrandScaleV2 } from "@/components/AdminDesktopBrandScaleV2";
import { AdminInterfacePolishV2 } from "@/components/AdminInterfacePolishV2";
import { AdminMobileQuarterMenu } from "@/components/AdminMobileQuarterMenu";
import { AdminMobileQuarterMenuPolish } from "@/components/AdminMobileQuarterMenuPolish";
import { AdminMobileNavPolishV2 } from "@/components/AdminMobileNavPolishV2";
import { AdminMobileRefreshThemeFix } from "@/components/AdminMobileRefreshThemeFix";
import { AdminMobileUiPolish } from "@/components/AdminMobileUiPolish";
import { AdminNavigationRecovery } from "@/components/AdminNavigationRecovery";
import { AdminPageRefreshTransition } from "@/components/AdminPageRefreshTransition";
import { AdminRetainedLiquidClass } from "@/components/AdminRetainedLiquidClass";
import { AdminRouteViewTransition } from "@/components/AdminRouteViewTransition";
import { AdminSingleNavigationGuard } from "@/components/AdminSingleNavigationGuard";
import { AdminUnifiedMotionEnhancer } from "@/components/AdminUnifiedMotionEnhancer";
import { ExactBase44ShellV2 } from "@/components/base44-exact/ExactBase44ShellV2";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminNavigationRecovery />
      <AdminDesktopBrandScaleV2 />
      <AdminInterfacePolishV2 />
      <AdminMobileNavPolishV2 />
      <AdminMobileRefreshThemeFix />
      <AdminMobileUiPolish />
      <AdminMobileQuarterMenuPolish />
      <AdminUnifiedMotionEnhancer />
      <AdminPageRefreshTransition />
      <AdminRouteViewTransition />
      <AdminRetainedLiquidClass />
      <AdminSingleNavigationGuard />
      <AdminMobileQuarterMenu />
      <ExactBase44ShellV2>{children}</ExactBase44ShellV2>
    </>
  );
}
