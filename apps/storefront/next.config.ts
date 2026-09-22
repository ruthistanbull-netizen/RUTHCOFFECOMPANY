import type { NextConfig } from "next";

const themeEditorOrigins = "https://rostapanel.zeabur.app http://localhost:* https://localhost:*";
const supabaseHttpOrigin = "https://fposvxuryzidmeuwytbg.supabase.co";

const supabaseWsOrigin = supabaseHttpOrigin.replace(/^http/, "ws");
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  `frame-ancestors 'self' ${themeEditorOrigins}`,
  "form-action 'self' https://*.paytr.com https://www.paytr.com https:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.paytr.com https://*.paytr.com https://connect.facebook.net https://www.googletagmanager.com https://www.clarity.ms",
  `connect-src 'self' ${supabaseHttpOrigin} ${supabaseWsOrigin} https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms`,
  "frame-src 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self \"https://www.paytr.com\" \"https://*.paytr.com\")" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  compress: true,
  poweredByHeader: false,
  env: {
    // Panelden websiteyi etkileyen değişiklikler için ikinci güvenlik ağı:
    // revalidate çağrısı kaçsa bile ürün/tema cache'i 10 saniyeyi aşmasın.
    NEXT_PUBLIC_CATALOG_REVALIDATE_SECONDS: "10",
  },
  transpilePackages: ["@ruth-commerce/ui", "@ruth-commerce/commerce-core", "@ruth-commerce/contracts"],
  experimental: {
    cpus: 2,
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
