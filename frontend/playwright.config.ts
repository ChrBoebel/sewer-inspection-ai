import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: "http://127.0.0.1:13137",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command:
        "APP_QUEUE_MODE=sync APP_DATA_DIR=../data/e2e ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 18137",
      cwd: "../backend",
      url: "http://127.0.0.1:18137/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command:
        "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18137 NEXT_PUBLIC_WS_BASE_URL=ws://127.0.0.1:18137 npm run dev -- --hostname 127.0.0.1 --port 13137",
      cwd: ".",
      url: "http://127.0.0.1:13137",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
});
