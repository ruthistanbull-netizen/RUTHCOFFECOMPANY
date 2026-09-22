import type { NextConfig } from "next";

const storefrontUrl =
  process.env.NEXT_PUBLIC_STORE_URL ||
  process.env.STORE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://rostacoffecompany.zeabur.app";

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_STORE_URL: storefrontUrl,
    NEXT_PUBLIC_SITE_URL: storefrontUrl,
  },
};

export default nextConfig;
