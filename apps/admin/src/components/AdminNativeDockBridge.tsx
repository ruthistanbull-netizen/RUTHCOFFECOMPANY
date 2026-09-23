"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  RuthNativeDock,
  canonicalNativeDockRoute,
  isNativeIOSShell,
  readNativeDockColorScheme,
  type RuthNativeDockTabSelectedEvent,
} from "@/lib/nativeDockBridge";

const NATIVE_IOS_ATTR = "data-ruth-native-ios";
const TAB_SELECTED_EVENT = "ruth-native-dock-tab-selected";

function nativeDockHiddenForPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/auth/") ||
    pathname === "/ruthie" ||
    pathname.startsWith("/ruthie/")
  );
}

export function AdminNativeDockBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!isNativeIOSShell()) return;

    const root = document.documentElement;
    root.setAttribute(NATIVE_IOS_ATTR, "true");

    let disposed = false;

    const syncTheme = () => {
      if (disposed || !initializedRef.current) return;
      void RuthNativeDock.setColorScheme({ colorScheme: readNativeDockColorScheme() });
    };

    const onTabSelected = (event: Event) => {
      const detail = (event as CustomEvent<RuthNativeDockTabSelectedEvent>).detail;
      const route = detail?.route;
      if (!route || route === window.location.pathname) return;
      router.push(route);
    };

    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener(TAB_SELECTED_EVENT, onTabSelected as EventListener);

    return () => {
      disposed = true;
      initializedRef.current = false;
      themeObserver.disconnect();
      window.removeEventListener(TAB_SELECTED_EVENT, onTabSelected as EventListener);
      root.removeAttribute(NATIVE_IOS_ATTR);
    };
  }, [router]);

  useEffect(() => {
    if (!isNativeIOSShell()) return;

    const route = canonicalNativeDockRoute(pathname);
    const hidden = nativeDockHiddenForPath(pathname);
    const colorScheme = readNativeDockColorScheme();

    if (!initializedRef.current) {
      initializedRef.current = true;
      void RuthNativeDock.show({ selectedRoute: route, colorScheme, hidden }).catch((error) => {
        initializedRef.current = false;
        console.error("Ruth native iOS dock failed to mount.", error);
      });
      return;
    }

    void Promise.all([
      RuthNativeDock.setSelectedRoute({ route }),
      RuthNativeDock.setHidden({ hidden }),
      RuthNativeDock.setColorScheme({ colorScheme }),
    ]).catch((error) => {
      console.error("Ruth native iOS dock failed to synchronize.", error);
    });
  }, [pathname]);

  return null;
}
