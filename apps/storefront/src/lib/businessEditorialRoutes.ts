export const BUSINESS_EDITORIAL_ROUTES = {
  studio: "/studio",
  wholesale: "/toptan-kahve",
} as const;

export function isBusinessEditorialRoute(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return Object.values(BUSINESS_EDITORIAL_ROUTES).some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}
