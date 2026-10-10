import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_ADMIN_URL || "http://127.0.0.1:3202";

export default defineConfig({
  testDir: "./tests/performance",
  testMatch: "admin-data-loading.spec.ts",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 2,
  reporter: "line",
  outputDir: "test-results/admin-loading",
  use: { baseURL, locale: "tr-TR", reducedMotion: "reduce", trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1" ? undefined : {
    command: "npm --prefix apps/admin run start -- --hostname 127.0.0.1 --port 3202",
    url: `${baseURL}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
