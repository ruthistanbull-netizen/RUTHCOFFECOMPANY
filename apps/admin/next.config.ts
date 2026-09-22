import type { NextConfig } from "next";

const storefrontUrl =
  process.env.NEXT_PUBLIC_STORE_URL ||
  process.env.STORE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_STORE_URL: storefrontUrl,
    NEXT_PUBLIC_SITE_URL: storefrontUrl,
  },
};

export default nextConfig;
