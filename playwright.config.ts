import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// All browser tests use their own database and credentials, never the shop's .local.
const dataDir = process.env.FILLICO_E2E_DATA_DIR || mkdtempSync(join(tmpdir(), 'fillico-browser-'));
process.env.FILLICO_E2E_DATA_DIR = dataDir;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: 'test-results/browser',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.FILLICO_TEST_BACKEND === 'php' ? 'http://127.0.0.1:3101' : 'http://127.0.0.1:3100',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: process.env.FILLICO_TEST_BACKEND === 'php' ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3100/api/store',
    reuseExistingServer: false,
    timeout: 60000,
    env: { PORT: '3100', DATA_DIR: dataDir, NODE_ENV: 'test' },
  },
});
