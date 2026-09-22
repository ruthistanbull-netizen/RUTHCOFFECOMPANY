import path from "node:path";

const storefrontUrl = "https://rostacoffecompany.zeabur.app";

/** @type {import("next").NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  transpilePackages: [
    "@ruth-commerce/ui",
    "@ruth-commerce/commerce-core",
    "@ruth-commerce/contracts",
  ],
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  output: "standalone",
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_STORE_URL: storefrontUrl,
    NEXT_PUBLIC_SITE_URL: storefrontUrl,
    NEXT_PUBLIC_PANEL_URL: "https://rostapanel.zeabur.app",
  },
};

export default nextConfig;
