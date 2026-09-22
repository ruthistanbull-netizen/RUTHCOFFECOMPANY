import type { NextConfig } from "next";

const storefrontUrl = "https://rostacoffecompany.zeabur.app";

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_STORE_URL: storefrontUrl,
    NEXT_PUBLIC_SITE_URL: storefrontUrl,
    NEXT_PUBLIC_PANEL_URL: "https://rostapanel.zeabur.app",
  },
};

export default nextConfig;
