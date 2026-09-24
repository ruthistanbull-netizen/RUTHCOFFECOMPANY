"use client";

export type RuthNativeDockColorScheme = "system" | "light" | "dark";

export type RuthNativeDockTabSelectedEvent = {
  route: string;
};

type CapacitorRuntime = {
  platform?: string;
  getPlatform?: () => string;
  isNativePlatform?: () => boolean;
  nativePromise?: (
    pluginId: string,
    methodName: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
};

declare global {
  interface Window {
    Capacitor?: CapacitorRuntime;
  }
}

function capacitorRuntime() {
  if (typeof window === "undefined") return undefined;
  return window.Capacitor;
}

function nativeDockCall(methodName: string, options: Record<string, unknown>) {
  const runtime = capacitorRuntime();
  if (!runtime?.nativePromise) {
    return Promise.reject(new Error("Capacitor native bridge is unavailable."));
  }
  return runtime.nativePromise("RuthNativeDock", methodName, options).then(() => undefined);
}

export const RuthNativeDock = {
  show(options: {
    selectedRoute: string;
    colorScheme: RuthNativeDockColorScheme;
    hidden?: boolean;
  }) {
    return nativeDockCall("show", options);
  },
  setSelectedRoute(options: { route: string }) {
    return nativeDockCall("setSelectedRoute", options);
  },
  setColorScheme(options: { colorScheme: RuthNativeDockColorScheme }) {
    return nativeDockCall("setColorScheme", options);
  },
  setHidden(options: { hidden: boolean }) {
    return nativeDockCall("setHidden", options);
  },
};

export function isNativeIOSShell() {
  const runtime = capacitorRuntime();
  if (!runtime?.nativePromise) return false;
  const platform = runtime.getPlatform?.() ?? runtime.platform;
  if (platform !== "ios") return false;
  return runtime.isNativePlatform ? runtime.isNativePlatform() : true;
}

export function canonicalNativeDockRoute(pathname: string) {
  if (pathname === "/") return "/";
  if (
    pathname === "/orders" ||
    pathname.startsWith("/orders/") ||
    pathname.startsWith("/abandoned-carts") ||
    pathname.startsWith("/preparing-products")
  ) {
    return "/orders";
  }
  if (pathname === "/products" || pathname.startsWith("/products/")) return "/products";
  if (pathname === "/customers" || pathname.startsWith("/customers/")) return "/customers";
  if (pathname === "/email" || pathname.startsWith("/email/")) return "/email";
  return "/";
}

export function readNativeDockColorScheme(): RuthNativeDockColorScheme {
  if (typeof document === "undefined") return "system";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}
