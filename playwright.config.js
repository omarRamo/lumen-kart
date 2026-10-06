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
    // The game picks French for French browsers: pin English so text assertions are stable on any machine.
    locale: 'en-US',
    launchOptions: {
      ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}),
      args: ['--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
  },
  webServer: [
    // Own bundle with the online mode enabled (it is hidden in store builds without VITE_WS_URL),
    // kept out of dist/ so the native/store build is never polluted by a test relay URL.
    {
      command: 'npx vite build --outDir .e2e-dist --emptyOutDir && npx vite preview --outDir .e2e-dist --host 127.0.0.1 --port 4173 --strictPort',
      env: { VITE_WS_URL: 'ws://127.0.0.1:8787/ws' },
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 120000,
    },
    { command: 'npm run server', url: 'http://127.0.0.1:8787/health', reuseExistingServer: true },
  ],
});
