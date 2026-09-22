import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storefrontUrl = "https://rostacoffecompany.zeabur.app";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    "@ruth-commerce/ui",
    "@ruth-commerce/commerce-core",
    "@ruth-commerce/contracts",
  ],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  output: "standalone",
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_STORE_URL: storefrontUrl,
    NEXT_PUBLIC_SITE_URL: storefrontUrl,
    NEXT_PUBLIC_PANEL_URL: "https://rostapanel.zeabur.app",
  },
};

export default nextConfig;
