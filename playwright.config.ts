import { defineConfig } from '@playwright/test';

/**
 * Playwright config — bugfix test suites.
 *
 * - testDir is set to `./tests` so every bugfix sub-directory under it is
 *   discovered (e.g. `tests/bugfix-image-empty-card/`,
 *   `tests/bugfix-image-routing/`). Individual suites can still be targeted
 *   by passing the directory or file as an argument to
 *   `npx playwright test`.
 * - webServer boots `node server.js` (which listens on PORT, default 3001) and
 *   waits until /index.html responds before running tests.
 * - We pin PORT=3000 here so baseURL stays stable regardless of any local PORT
 *   environment variable already on the developer's machine.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PORT: '3000',
      NODE_ENV: 'test',
    },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
