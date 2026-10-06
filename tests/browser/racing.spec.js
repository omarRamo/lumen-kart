import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.state === 'title', { timeout: 30000 });
  expect(await page.evaluate(() => window.__game.errors())).toEqual([]);
}

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

async function expectMobileCockpit(page) {
  const layout = await page.evaluate(() => {
    const selectors = ['.mobile-toolbar', '.mobile-steering', '.mobile-actions', '.hud-tl', '.hud-minimap', '.hud-br'];
    const regions = selectors.map(selector => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return { selector, left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    });
    const targets = [...document.querySelectorAll('.mobile-controls button, .mobile-steering')].map(element => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, clipped: element.scrollWidth > element.clientWidth + 1 };
    });
    return { regions, targets, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(layout.overflow).toBe(false);
  for (const target of layout.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.clipped, 'control labels must fit').toBe(false);
  }
  for (const [index, region] of layout.regions.entries()) {
    expect(region.left, region.selector).toBeGreaterThanOrEqual(0);
    expect(region.top, region.selector).toBeGreaterThanOrEqual(0);
    expect(region.right, region.selector).toBeLessThanOrEqual(layout.width);
    expect(region.bottom, region.selector).toBeLessThanOrEqual(layout.height);
    for (const other of layout.regions.slice(index + 1)) {
      const overlap = Math.min(region.right, other.right) - Math.max(region.left, other.left) > 1
        && Math.min(region.bottom, other.bottom) - Math.max(region.top, other.top) > 1;
      expect(overlap, `${region.selector} must not overlap ${other.selector}`).toBe(false);
    }
  }
}

test('mobile layout, touch driving, tilt fallback, pause and results', async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.DeviceOrientationEvent = class extends Event {
      static permission = 'denied';
      static async requestPermission() { return this.permission; }
      constructor(type, { beta, gamma } = {}) {
        super(type);
        this.beta = beta;
        this.gamma = gamma;
      }
    };
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await page.locator('.title-screen').tap();
  await page.locator('.mode-card.m-vs').tap();
  await page.locator('.race-btn').tap();
  await page.locator('.course-card', { hasText: 'SUNSET CANYON' }).tap();
  await page.waitForFunction(() => window.__game.state === 'intro');
  await page.evaluate(() => window.__game.skipIntro());
  await page.waitForFunction(() => window.__game.state === 'racing');
  await expect(page.locator('.mobile-controls')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__game.world.player.speed), { timeout: 10000 }).toBeGreaterThan(5);
  expect(await page.evaluate(() => window.__game.world.track.id)).toBe('sunset-canyon');
  await expect(page.locator('.mobile-sensor')).toHaveText('GYRO OFF');
  await page.locator('.mobile-sensor').tap();
  await expect(page.locator('.mobile-status')).toHaveText('GYRO UNAVAILABLE');
  await expect(page.locator('.mobile-sensor')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => { DeviceOrientationEvent.permission = 'granted'; });
  await page.locator('.mobile-sensor').tap();
  await expect(page.locator('.mobile-sensor')).toHaveText('GYRO ON');
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 0, gamma: 0 }));
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 16, gamma: 16 }));
  });
  await expect.poll(() => page.evaluate(() => Math.abs(window.__game.world.player.input.steer))).toBeGreaterThan(0.3);
  await page.locator('.mobile-sensor').tap();

  const touches = await context.newCDPSession(page);
  const steeringBounds = await page.locator('.mobile-steering').boundingBox();
  const steering = { id: 1, x: steeringBounds.x + steeringBounds.width / 2, y: steeringBounds.y + steeringBounds.height / 2 };
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steering] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.steer)).toBe(0);
  steering.x += 30;
  await touches.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [steering] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.steer)).toBeGreaterThan(0.2);
  expect(await page.evaluate(() => window.__game.world.player.input.steer)).toBeLessThan(0.5);
  const driftBounds = await page.locator('[data-hold=drift]').boundingBox();
  const drift = { id: 2, x: driftBounds.x + driftBounds.width / 2, y: driftBounds.y + driftBounds.height / 2 };
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steering, drift] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.drift)).toBe(true);
  await touches.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.steer)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.drift)).toBe(false);
  await expect(page.locator('.mobile-steering')).toHaveAttribute('aria-valuenow', '0');
  const brakeBounds = await page.locator('[data-hold=brake]').boundingBox();
  const brake = { id: 3, x: brakeBounds.x + brakeBounds.width / 2, y: brakeBounds.y + brakeBounds.height / 2 };
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [brake] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.brake)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.throttle)).toBe(0);
  await touches.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.input.brake)).toBe(0);
  await touches.detach();
  await page.locator('.mobile-pause').tap();
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('paused');
  await page.locator('[data-a=resume]').tap();
  await expect.poll(() => page.evaluate(() => window.__game.state)).toBe('racing');
  await expectRenderedScene(page);
  await expectMobileCockpit(page);
  await page.screenshot({ path: 'test-results/mobile-landscape.png' });
  await page.evaluate(() => window.__game.finishPlayer());
  await expect(page.locator('.results')).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__game.errors())).toEqual([]);
  await context.close();
});

test('mobile item feedback, defensive hold and drift charge stay available in portrait', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  await page.evaluate(() => window.__game.startRace({ gameMode: 'tt', trackId: 'palm-cove', classId: '50cc' }));
  await page.waitForFunction(() => window.__game.state === 'intro');
  await page.evaluate(() => window.__game.fastForward(4));
  await page.waitForFunction(() => window.__game.state === 'racing');
  await page.evaluate(() => {
    const world = window.__game.world;
    world.items.giveItem(world.player, 'triple_mushroom');
  });
  const item = page.locator('.mobile-item');
  await expect(item).toBeEnabled();
  await expect(page.locator('.mobile-item-count')).toHaveText('×3');
  await expect(page.locator('.mobile-item-icon')).toBeVisible();
  expect(await page.locator('.mobile-item-icon').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expectRenderedScene(page);
  await expectMobileCockpit(page);
  await page.screenshot({ path: 'test-results/mobile-portrait-race.png' });
  await item.tap();
  await expect.poll(() => page.evaluate(() => window.__game.world.player.itemCount)).toBe(2);
  await expect(page.locator('.mobile-item-count')).toHaveText('×2');
  await page.evaluate(() => {
    const game = window.__game;
    game.world.items.giveItem(game.world.player, 'banana');
    game.fastForward(0.4);
  });
  await expect(item).toHaveAttribute('aria-label', 'Use banana');
  const touches = await context.newCDPSession(page);
  const bounds = await item.boundingBox();
  await touches.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }] });
  await expect.poll(() => page.evaluate(() => window.__game.world.items.isDragging(window.__game.world.player))).toBe(true);
  expect(await page.evaluate(() => window.__game.world.player.item)).toBe('banana');
  await touches.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.__game.world.player.item)).toBe(null);
  await expect(item).toBeDisabled();
  await touches.detach();

  const feedback = await page.evaluate(() => {
    const game = window.__game;
    const controls = game.mobileControls;
    controls.updateRace({ drifting: true, driftLevel: 2, driftCharge: 1.9, boostTimer: 0 });
    const ready = { label: controls.driftLabel.textContent, level: controls.driftButton.dataset.level, charge: controls.driftButton.style.getPropertyValue('--charge') };
    controls.updateRace({ drifting: false, boostTimer: 0.5 });
    const boost = controls.driftLabel.textContent;
    controls.updateRace(game.world.player, game.world.items);
    return { ready, boost };
  });
  expect(feedback.ready).toEqual({ label: 'SUPER', level: '2', charge: '0.67' });
  expect(feedback.boost).toBe('BOOST');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__game.errors())).toEqual([]);
  await context.close();
});

test('private invite joins two clients, shared race, remote steering, results and disconnect', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  const errors=[];
  for (const page of [host, guest]) page.on('pageerror',e=>errors.push(e.message));
  await boot(host); await boot(guest);
  for (const page of [host,guest]) { await page.locator('.title-screen').click(); await page.locator('.mode-card.m-vs').click(); await page.locator('.online-race-btn').click(); }
  await host.locator('[data-name]').fill('Host');
  await host.locator('[data-create]').click();
  await expect(host.locator('.online-code strong')).toBeVisible();
  const code = await host.locator('.online-code strong').textContent();
  await guest.locator('[data-code]').fill(code);
  await guest.locator('[data-name]').fill('Guest');
  await guest.locator('[data-join]').click();
  await expect(guest.locator('.online-code strong')).toHaveText(code);
  await host.locator('[data-ready]').click();
  await guest.locator('[data-ready]').click();
  await expect(host.locator('[data-start]')).toBeEnabled();
  await host.locator('[data-start]').click();
  for (const page of [host,guest]) await page.waitForFunction(()=>window.__game.state==='racing', {timeout:30000});
  const initial = await host.evaluate(()=>window.__game.world.karts[1].position.toArray());
  await guest.keyboard.down('ArrowUp');
  await expect.poll(()=>host.evaluate(()=>window.__game.world.karts[1].speed), {timeout:10000}).toBeGreaterThan(8);
  await expect.poll(() => guest.evaluate(start => {
    const position = window.__game.world.player.position.toArray();
    return Math.hypot(...position.map((value, index) => value - start[index]));
  }, initial), { timeout: 10000 }).toBeGreaterThan(1);
  await guest.keyboard.up('ArrowUp');
  const positions = await guest.evaluate(()=>({pos:window.__game.world.player.position.toArray(),index:window.__game.world.player.index,phase:window.__game.world.race.phase}));
  expect(positions.index).toBe(1); expect(positions.phase).toBe('racing');
  expect(Math.hypot(...positions.pos.map((v,i)=>v-initial[i]))).toBeGreaterThan(1);
  await expectRenderedScene(guest);
  await guest.screenshot({ path: 'test-results/desktop-race.png' });
  await host.evaluate(()=>{ const w=window.__game.world; for (const k of w.karts.filter(k=>k.netId)) w.race._finish(k); });
  for (const page of [host,guest]) await expect(page.locator('.results')).toBeVisible({timeout:15000});
  expect(await host.evaluate(()=>window.__game.errors())).toEqual([]);
  expect(await guest.evaluate(()=>window.__game.errors())).toEqual([]);
  await host.evaluate(()=>window.__game.goToTitle());
  await expect.poll(()=>guest.evaluate(()=>window.__game.state)).toBe('title');
  expect(errors).toEqual([]);
  await ctx.close();
});


test('portrait menu and all course renders remain usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  await page.locator('.title-screen').tap();
  await expect(page.locator('.mode-screen')).toHaveCSS('opacity', '1');
  await page.locator('.mode-card.m-gp').tap();
  await expect(page.locator('.select-screen')).toHaveCSS('opacity', '1');
  await expect(page.locator('.online-race-btn')).toBeVisible();
  await page.screenshot({path:'test-results/mobile-portrait-menu.png'});
  await page.setViewportSize({width:844,height:390});
  await expect(page.locator('.select-screen')).toHaveCSS('opacity', '1');
  await page.screenshot({path:'test-results/mobile-landscape-menu.png'});
  for (const trackId of ['frosty-peaks','sunset-canyon','lava-keep']) {
    await page.evaluate(trackId=>window.__game.startRace({gameMode:'vs',trackId,classId:'150cc'}),trackId);
    await page.waitForFunction(trackId=>window.__game.state==='intro' && window.__game.world.track.id===trackId,trackId);
    await page.evaluate(()=>window.__game.fastForward(4));
    await page.waitForFunction(()=>window.__game.state==='racing');
    await expectRenderedScene(page);
    await page.screenshot({path:`test-results/${trackId}.png`});
    expect(await page.evaluate(()=>window.__game.world.hazards.items.length)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>window.__game.errors())).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

test('mobile cockpit fits small phones after rotation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  await page.evaluate(() => window.__game.startRace({ gameMode: 'vs', trackId: 'palm-cove', classId: '50cc' }));
  await page.waitForFunction(() => window.__game.state === 'intro');
  await page.evaluate(() => window.__game.fastForward(4));
  await page.waitForFunction(() => window.__game.state === 'racing');
  for (const viewport of [{ width: 568, height: 320 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expectRenderedScene(page);
    await expectMobileCockpit(page);
    await page.screenshot({ path: `test-results/mobile-${viewport.width}x${viewport.height}.png` });
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__game.errors())).toEqual([]);
  await context.close();
});
