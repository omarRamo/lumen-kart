// Lumen Kart — end-to-end browser suite (Playwright).
// Runs against the production bundle built by playwright.config.js into .e2e-dist/ with VITE_WS_URL set,
// so the online mode (hidden in store builds) is reachable. Selectors follow the UX contract
// (docs/agents/ux.md §2): data-testid attributes plus the kept classes .mobile-*, [data-hold], .hud-*, .results.
import { test, expect } from '@playwright/test';

const PHONE_LANDSCAPE = { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };

/** Opens the game and waits for the title screen; collects page errors. */
async function boot(page, errors = []) {
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 45000 });
  expect(await page.evaluate(() => window.__game.errors())).toEqual([]);
  return errors;
}

const gameState = page => page.evaluate(() => window.__game.state);

async function expectNoGameErrors(page, errors) {
  expect(errors, 'uncaught page errors').toEqual([]);
  expect(await page.evaluate(() => window.__game.errors()), 'errors caught by the game loop').toEqual([]);
}

/** The WebGL canvas must show actual scenery, not a blank or flat frame. */
async function expectRenderedScene(page) {
  const pixels = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
    const sample = document.createElement('canvas');
    sample.width = 48; sample.height = 32;
    const context = sample.getContext('2d');
    context.drawImage(window.__game.renderer.domElement, 0, 0, sample.width, sample.height);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    const colors = new Set();
    let visible = 0, minimum = 255, maximum = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      const brightness = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
      if (data[offset + 3] > 0 && brightness > 10) visible++;
      minimum = Math.min(minimum, brightness);
      maximum = Math.max(maximum, brightness);
      colors.add(`${data[offset] >> 4}:${data[offset + 1] >> 4}:${data[offset + 2] >> 4}`);
    }
    resolve({ visible, colors: colors.size, contrast: maximum - minimum });
  })));
  expect(pixels.visible, 'the WebGL scene must not be blank').toBeGreaterThan(200);
  expect(pixels.colors, 'the canvas must contain actual scenery').toBeGreaterThan(24);
  expect(pixels.contrast).toBeGreaterThan(40);
}

/** Touch cockpit and HUD stay on screen, are big enough, and never overlap each other. */
async function expectMobileCockpit(page) {
  const layout = await page.evaluate(() => {
    const selectors = ['.mobile-toolbar', '.mobile-steering', '.mobile-actions', '.hud-tl', '.hud-minimap', '.hud-br'];
    const regions = selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const b = element.getBoundingClientRect();
      return { selector, left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
    });
    const targets = [...document.querySelectorAll('.mobile-controls button, .mobile-steering')]
      .filter(element => element.getClientRects().length)
      .map(element => {
        const b = element.getBoundingClientRect();
        return { name: element.dataset.testid || element.className, width: b.width, height: b.height, clipped: element.scrollWidth > element.clientWidth + 1 };
      });
    return { regions, targets, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(layout.overflow, 'no horizontal page overflow').toBe(false);
  for (const region of layout.regions) expect(region.missing, `${region.selector} exists`).toBeFalsy();
  for (const target of layout.targets) {
    expect(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
    expect(target.clipped, `${target.name} label must fit`).toBe(false);
  }
  const visible = layout.regions.filter(r => r.width > 0 && r.height > 0);
  for (const [index, region] of visible.entries()) {
    expect(region.left, region.selector).toBeGreaterThanOrEqual(-1);
    expect(region.top, region.selector).toBeGreaterThanOrEqual(-1);
    expect(region.right, region.selector).toBeLessThanOrEqual(layout.width + 1);
    expect(region.bottom, region.selector).toBeLessThanOrEqual(layout.height + 1);
    for (const other of visible.slice(index + 1)) {
      const overlap = Math.min(region.right, other.right) - Math.max(region.left, other.left) > 1
        && Math.min(region.bottom, other.bottom) - Math.max(region.top, other.top) > 1;
      expect(overlap, `${region.selector} must not overlap ${other.selector}`).toBe(false);
    }
  }
}

/** Starts a race straight from the game API and lands in the 'racing' state. */
async function startRaceDirect(page, settings) {
  await page.evaluate(s => window.__game.startRace(s), settings);
  await page.waitForFunction(id => ['intro', 'countdown', 'racing'].includes(window.__game.state) && window.__game.world?.track?.id === id,
    settings.trackId, { timeout: 30000 });
  await page.evaluate(() => window.__game.fastForward(4));
  await page.waitForFunction(() => window.__game.state === 'racing', null, { timeout: 15000 });
}

const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

// (1) ---------------------------------------------------------------------------------------------
test('mobile landscape: menu flow to a race, then touch driving, pause and results', async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext(PHONE_LANDSCAPE);
  const page = await context.newPage();
  const errors = await boot(page);

  await page.getByTestId('title-play').tap();
  await page.getByTestId('mode-vs').tap();
  await page.getByTestId('class-100cc').tap();
  await page.getByTestId('track-sunset-canyon').tap();
  await page.getByTestId('start-race').tap();
  await page.waitForFunction(() => ['intro', 'countdown', 'racing'].includes(window.__game.state), null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__game.world.track.id)).toBe('sunset-canyon');
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForFunction(() => window.__game.state === 'racing', null, { timeout: 15000 });

  await expect(page.locator('.mobile-controls')).toBeVisible();
  // Acceleration is automatic on touch devices.
  await expect.poll(() => page.evaluate(() => window.__game.world.player.speed), { timeout: 15000 }).toBeGreaterThan(5);

  // A few seconds of driving with the touch controls: steer right while holding drift, then brake.
  const touches = await context.newCDPSession(page);
  const steering = { id: 1, ...center(await page.getByTestId('touch-steering').boundingBox()) };
  const drift = { id: 2, ...center(await page.getByTestId('touch-drift').boundingBox()) };
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steering] });
  steering.x += 40;
  await touches.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [steering] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.steer)).toBeGreaterThan(0.2);
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steering, drift] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.drift)).toBe(true);
  const start = await page.evaluate(() => window.__game.world.player.position.toArray());
  await page.waitForTimeout(2500);
  const travelled = await page.evaluate(s => Math.hypot(...window.__game.world.player.position.toArray().map((v, i) => v - s[i])), start);
  expect(travelled, 'the kart drives while steering and drifting').toBeGreaterThan(3);
  await touches.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.steer)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.drift)).toBe(false);

  const brake = { id: 3, ...center(await page.getByTestId('touch-brake').boundingBox()) };
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [brake] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.brake)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.throttle)).toBe(0);
  await touches.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.brake)).toBe(0);
  await touches.detach();

  await page.getByTestId('touch-pause').tap();
  await expect.poll(() => gameState(page)).toBe('paused');
  await page.locator('[data-a=resume]').tap();
  await expect.poll(() => gameState(page)).toBe('racing');

  await expectRenderedScene(page);
  await expectMobileCockpit(page);
  await page.screenshot({ path: 'test-results/mobile-landscape-race.png' });
  await page.evaluate(() => window.__game.finishPlayer());
  await expect(page.locator('.results')).toBeVisible({ timeout: 15000 });
  await expectNoGameErrors(page, errors);
  await context.close();
});

// (2) ---------------------------------------------------------------------------------------------
async function cockpitAt(browser, sizes) {
  const context = await browser.newContext({ viewport: sizes[0], isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = await boot(page);
  await startRaceDirect(page, { gameMode: 'vs', trackId: 'palm-cove', classId: '50cc' });
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/mobile-${viewport.width}x${viewport.height}.png` });
    await expectMobileCockpit(page);
  }
  await expectRenderedScene(page);
  await expectNoGameErrors(page, errors);
  await context.close();
}

test('portrait 320x568: toolbar and HUD never overlap, also after rotating to a phone landscape and back', async ({ browser }) => {
  test.setTimeout(120000);
  await cockpitAt(browser, [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 320, height: 568 }]);
});

test('small landscape 568x320 (iPhone SE 1st gen) cockpit', async ({ browser }) => {
  // Regression guard: the position badge used to touch the toolbar at this size (fixed in src/mobile.css).
  test.setTimeout(120000);
  await cockpitAt(browser, [{ width: 568, height: 320 }]);
});

// (3) ---------------------------------------------------------------------------------------------
test('settings: switching language FR ⇄ EN is immediate and persists', async ({ browser }) => {
  const context = await browser.newContext({ ...PHONE_LANDSCAPE, locale: 'en-US' });
  const page = await context.newPage();
  const errors = await boot(page);
  const play = page.getByTestId('title-play');
  await expect(play).toContainText('Play');

  await page.getByTestId('title-settings').tap();
  await page.locator('[data-act=set][data-k=lang][data-v=fr]').tap();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page.locator('[data-act=set][data-k=lang][data-v=fr]')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-screen=settings] .menu-head')).toContainText('Réglages');
  await page.locator('[data-screen=settings]').getByTestId('back').tap();
  await expect(play).toContainText('Jouer');

  // The choice survives a reload (stored in lumenkart.settings.v1).
  await page.reload();
  await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 45000 });
  await expect(page.getByTestId('title-play')).toContainText('Jouer');

  await page.getByTestId('title-settings').tap();
  await page.locator('[data-act=set][data-k=lang][data-v=en]').tap();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
  await expect(page.locator('[data-screen=settings] .menu-head')).toContainText('Settings');
  await page.locator('[data-screen=settings]').getByTestId('back').tap();
  await expect(page.getByTestId('title-play')).toContainText('Play');
  await expectNoGameErrors(page, errors);
  await context.close();
});

// (4) ---------------------------------------------------------------------------------------------
test('Grand Prix: four races through the standings to the podium', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext(PHONE_LANDSCAPE);
  const page = await context.newPage();
  const errors = await boot(page);
  const cup = await page.evaluate(() => {
    window.__game.startRace({ gameMode: 'gp', cupId: 'dawn', classId: '50cc' });
    return window.__game.gp && { id: window.__game.gp.cup.id, tracks: [...window.__game.gp.cup.tracks] };
  });
  expect(cup?.id).toBe('dawn');
  expect(cup.tracks.length).toBe(4);
  for (const [index, trackId] of cup.tracks.entries()) {
    await page.waitForFunction(id => ['intro', 'countdown', 'racing'].includes(window.__game.state) && window.__game.world?.track?.id === id,
      trackId, { timeout: 30000 });
    expect(await page.evaluate(() => window.__game.gp.index)).toBe(index);
    await page.evaluate(() => window.__game.fastForward(4));
    await page.evaluate(() => window.__game.finishPlayer());
    await expect(page.locator('.results')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('results-next').click();
  }
  await expect(page.locator('.results.podium-screen')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.podium')).toBeVisible();
  // a first gold in the Dawn Cup unlocks the trophy and the Dusk Cup: ONE collapsed card, dismissed by a tap
  await expect(page.locator('.unlock-card')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('.unlock-card b')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/gp-podium.png' });
  await page.locator('.unlock-card').click();
  await expect(page.locator('.unlock-card')).toHaveCount(0, { timeout: 2000 });
  await page.getByTestId('results-done').click();
  await expect.poll(() => gameState(page), { timeout: 15000 }).toBe('title');
  expect(await page.evaluate(() => window.__game.gp)).toBeNull();
  // celebrations never spill into the next screens
  await page.getByTestId('title-play').click();
  await expect(page.locator('.unlock-card')).toHaveCount(0);
  await expectNoGameErrors(page, errors);
  await context.close();
});

// (5) ---------------------------------------------------------------------------------------------
test('online: private room, two browsers, remote steering, results and host disconnect', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  const errors = [];
  await boot(host, errors);
  await boot(guest, errors);
  for (const page of [host, guest]) await page.evaluate(() => window.__game.openOnline());

  await host.locator('[data-name]').fill('Host');
  await host.locator('[data-create]').click();
  await expect(host.locator('.online-code strong')).toBeVisible({ timeout: 15000 });
  const code = await host.locator('.online-code strong').textContent();
  await guest.locator('[data-code]').fill(code);
  await guest.locator('[data-name]').fill('Guest');
  await guest.locator('[data-join]').click();
  await expect(guest.locator('.online-code strong')).toHaveText(code);
  await host.locator('[data-ready]').click();
  await guest.locator('[data-ready]').click();
  await expect(host.locator('[data-start]')).toBeEnabled();
  await host.locator('[data-start]').click();
  for (const page of [host, guest]) await page.waitForFunction(() => window.__game.state === 'racing', null, { timeout: 30000 });

  const initial = await host.evaluate(() => window.__game.world.karts[1].position.toArray());
  await guest.keyboard.down('ArrowUp');
  await expect.poll(() => host.evaluate(() => window.__game.world.karts[1].speed), { timeout: 10000 }).toBeGreaterThan(8);
  await expect.poll(() => guest.evaluate(start => {
    const position = window.__game.world.player.position.toArray();
    return Math.hypot(...position.map((value, index) => value - start[index]));
  }, initial), { timeout: 10000 }).toBeGreaterThan(1);
  await guest.keyboard.up('ArrowUp');
  const guestView = await guest.evaluate(() => ({ index: window.__game.world.player.index, phase: window.__game.world.race.phase }));
  expect(guestView).toEqual({ index: 1, phase: 'racing' });
  await expectRenderedScene(guest);
  await guest.screenshot({ path: 'test-results/online-guest.png' });

  await host.evaluate(() => { const w = window.__game.world; for (const k of w.karts.filter(k => k.netId)) w.race._finish(k); });
  for (const page of [host, guest]) await expect(page.locator('.results')).toBeVisible({ timeout: 15000 });
  await host.evaluate(() => window.__game.goToTitle());
  await expect.poll(() => gameState(guest), { timeout: 15000 }).toBe('title');
  expect(errors).toEqual([]);
  expect(await host.evaluate(() => window.__game.errors())).toEqual([]);
  expect(await guest.evaluate(() => window.__game.errors())).toEqual([]);
  await ctx.close();
});
