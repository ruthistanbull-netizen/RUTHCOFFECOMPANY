import path from "node:path";

const storefrontUrl = "https://rostacoffecompany.zeabur.app";
const panelUrl = "https://rostapanel.zeabur.app";

/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@ruth-commerce/ui",
    "@ruth-commerce/commerce-core",
    "@ruth-commerce/contracts",
  ],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  productionBrowserSourceMaps: false,
  experimental: {
    cpus: 1,
    serverSourceMaps: false,
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
  env: {
    NEXT_PUBLIC_STORE_URL: storefrontUrl,
    NEXT_PUBLIC_SITE_URL: storefrontUrl,
    PUBLIC_SITE_URL: storefrontUrl,
    NEXT_PUBLIC_PANEL_URL: panelUrl,
  },
  async headers() {
    return [
      {
        source: "/ruthie/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "microphone=(self), camera=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
