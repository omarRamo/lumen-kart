#!/usr/bin/env node
// Lumen Kart — App Store / Google Play screenshots, captured from the real production build.
//
//   npm run build && npm run store:screenshots
//   node tools/capture-store-screenshots.mjs --only=ios-6.9,play-phone --lang=fr-FR --out=store/screenshots
//
// Serves dist/ with the bundled relay (server/index.js, no extra dependency), opens it in Chromium
// (local Google Chrome when installed, else Playwright's) with a touch/mobile context at each store size,
// and drives the game through window.__game (startRace / skipIntro / fastForward / debug.autopilot).
// Output: store/screenshots/<lang>/<device>/NN-<scene>.png (git-ignored: regenerate before each upload).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay } from '../server/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v = 'true']) => [k, v]));

// Landscape store sizes. CSS viewport × deviceScaleFactor = exact pixel size required by the store.
export const DEVICES = {
  'ios-6.9':        { store: 'App Store', label: 'iPhone 6.9"',  size: [2868, 1320], viewport: [956, 440],  dpr: 3 },
  'ios-6.7':        { store: 'App Store', label: 'iPhone 6.7"',  size: [2796, 1290], viewport: [932, 430],  dpr: 3 },
  'ios-6.5':        { store: 'App Store', label: 'iPhone 6.5"',  size: [2688, 1242], viewport: [896, 414],  dpr: 3 },
  'ipad-13':        { store: 'App Store', label: 'iPad 13"',     size: [2752, 2064], viewport: [1376, 1032], dpr: 2 },
  'play-phone':     { store: 'Google Play', label: 'Phone 16:9', size: [1920, 1080], viewport: [960, 540],  dpr: 2 },
  'play-tablet-7':  { store: 'Google Play', label: 'Tablet 7"',  size: [1920, 1200], viewport: [960, 600],  dpr: 2 },
  'play-tablet-10': { store: 'Google Play', label: 'Tablet 10"', size: [2560, 1600], viewport: [1280, 800], dpr: 2 },
};

// Scenes: the title, then races in different worlds. Unknown circuits are skipped, not fatal.
const SCENES = [
  { name: 'title' },
  { name: 'dawn-meadows', race: { gameMode: 'vs', trackId: 'meadow', classId: '100cc' }, seconds: 9 },
  { name: 'coral-lagoons', race: { gameMode: 'vs', trackId: 'palm-cove', classId: '150cc' }, seconds: 14 },
  { name: 'singing-dunes', race: { gameMode: 'vs', trackId: 'sunset-canyon', classId: '150cc' }, seconds: 11 },
  { name: 'sidi-bou-said', race: { gameMode: 'vs', trackId: 'medina', classId: '150cc' }, seconds: 12 },
  { name: 'aurora-night', race: { gameMode: 'vs', trackId: 'frosty-peaks', classId: '100cc' }, seconds: 10 },
  { name: 'realm-of-night', race: { gameMode: 'vs', trackId: 'lava-keep', classId: '200cc' }, seconds: 12 },
];

const only = args.only ? args.only.split(',') : Object.keys(DEVICES);
const langs = (args.lang || 'fr-FR,en-US').split(',');
const outDir = resolve(root, args.out || 'store/screenshots');

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}

const relay = createRelay({ port: 0, host: '127.0.0.1', staticDir: join(root, 'dist') });
const { port } = await relay.listen();
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) && !args.bundled ? { executablePath: chrome } : {}),
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
});

let count = 0;
const failures = [];
try {
  for (const lang of langs) {
    for (const id of only) {
      const device = DEVICES[id];
      if (!device) { console.warn(`unknown device ${id}`); continue; }
      const context = await browser.newContext({
        viewport: { width: device.viewport[0], height: device.viewport[1] },
        deviceScaleFactor: device.dpr, isMobile: true, hasTouch: true, locale: lang,
        reducedMotion: 'no-preference',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 45000 });
      await page.waitForTimeout(1200);
      const folder = join(outDir, lang, id);
      mkdirSync(folder, { recursive: true });
      let index = 1;
      for (const scene of SCENES) {
        try {
          if (scene.race) {
            const started = await page.evaluate(async ({ race, seconds }) => {
              const g = window.__game;
              g.startRace(race);
              const deadline = performance.now() + 20000;
              while (!['intro', 'countdown', 'racing'].includes(g.state)) {
                if (performance.now() > deadline) return false;
                await new Promise(r => setTimeout(r, 50));
              }
              if (g.world?.track?.id !== race.trackId) return false;
              if (g.debug) g.debug.autopilot = true;
              g.skipIntro?.();
              g.fastForward(seconds);
              return true;
            }, scene);
            if (!started) { console.warn(`  skip ${scene.name} (circuit ${scene.race.trackId} unavailable)`); continue; }
            await page.waitForFunction(() => window.__game.state === 'racing', null, { timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(900); // let a few real frames render (particles, HUD, scarf)
          }
          const file = join(folder, `${String(index).padStart(2, '0')}-${scene.name}.png`);
          await page.screenshot({ path: file, animations: 'allow' });
          index++; count++;
        } catch (error) {
          failures.push(`${lang}/${id}/${scene.name}: ${error.message.split('\n')[0]}`);
        }
      }
      if (errors.length) failures.push(`${lang}/${id}: page errors ${errors.slice(0, 3).join(' | ')}`);
      console.log(`${lang} ${device.store} ${device.label} ${device.size.join('×')}: ${index - 1} screenshots → ${folder}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await relay.close();
}
console.log(`${count} screenshots written to ${outDir}`);
if (failures.length) {
  console.error('Problems:\n  ' + failures.join('\n  '));
  process.exitCode = 1;
}
