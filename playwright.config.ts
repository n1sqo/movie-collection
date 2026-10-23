import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['iPhone 14 Pro'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4300/movie-collection/',
    // The service worker would bypass the route mocks below.
    serviceWorkers: 'block',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  },
  webServer: {
    command: 'npx vite preview --port 4300 --strictPort',
    url: 'http://localhost:4300/movie-collection/',
    reuseExistingServer: !process.env.CI
  }
})
