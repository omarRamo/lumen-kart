import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    launchOptions: {
      ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}),
      args: ['--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
    { command: 'npm run server', url: 'http://127.0.0.1:8787/health', reuseExistingServer: true },
  ],
});
