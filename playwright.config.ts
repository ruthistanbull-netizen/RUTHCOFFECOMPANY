import { defineConfig } from "@playwright/test";

const storefrontBaseURL = process.env.PLAYWRIGHT_STOREFRONT_URL || "http://127.0.0.1:3100";
const adminBaseURL = process.env.PLAYWRIGHT_ADMIN_URL || "http://127.0.0.1:3200";
const externalServers = process.env.PLAYWRIGHT_EXTERNAL_SERVERS === "1";
const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 1000 },
] as const;

export default defineConfig({
  testDir: "./tests/quality",
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.005, threshold: 0.18 } },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]] : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/phase-1e",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  use: { colorScheme: "light", deviceScaleFactor: 1, locale: "tr-TR", reducedMotion: "reduce", screenshot: "only-on-failure", trace: "retain-on-failure", video: "retain-on-failure" },
  webServer: externalServers ? undefined : [
    { command: "npm --prefix apps/storefront run start -- --hostname 127.0.0.1 --port 3100", url: `${storefrontBaseURL}/robots.txt`, reuseExistingServer: !process.env.CI, timeout: 180_000, stdout: "pipe", stderr: "pipe" },
    { command: "npm --prefix apps/admin run start -- --hostname 127.0.0.1 --port 3200", url: `${adminBaseURL}/manifest.webmanifest`, reuseExistingServer: !process.env.CI, timeout: 180_000, stdout: "pipe", stderr: "pipe" },
  ],
  projects: [
    ...viewports.map((viewport) => ({ name: `storefront-${viewport.name}`, testMatch: /storefront.*\.quality\.spec\.ts/, use: { baseURL: storefrontBaseURL, viewport: { width: viewport.width, height: viewport.height } } })),
    ...viewports.map((viewport) => ({ name: `admin-${viewport.name}`, testMatch: /admin.*\.quality\.spec\.ts/, use: { baseURL: adminBaseURL, viewport: { width: viewport.width, height: viewport.height } } })),
  ],
});
