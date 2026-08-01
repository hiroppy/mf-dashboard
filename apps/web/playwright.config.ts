import { defineConfig, devices } from "@playwright/test";

const mockCrawlerUrl = "http://127.0.0.1:18766";
const mockCrawlerToken = "e2e-refresh-token";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: process.env.CI ? "blob" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx e2e/mock-crawler-server.ts",
      url: `${mockCrawlerUrl}/__test/health`,
      env: {
        MOCK_CRAWLER_PORT: "18766",
        MOCK_CRAWLER_TOKEN: mockCrawlerToken,
      },
      reuseExistingServer: false,
    },
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      env: {
        CRAWLER_URL: mockCrawlerUrl,
        DB_PATH: "../../data/demo.db",
        DEMO_MODE: "true",
        REFRESH_TOKEN: mockCrawlerToken,
      },
      reuseExistingServer: false,
    },
  ],
});
