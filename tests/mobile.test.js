import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../src/input.js';
import { MobileControls, screenTilt, tiltSteer, gravityTilt, touchSteer, driftProgress } from '../src/mobile-controls.js';
import { PHYSICS } from '../src/config.js';
import { Menu } from '../src/menu.js';

test('mobile acceleration is automatic only during racing and never charges countdown', () => {
  const input = new InputController({ target: new EventTarget() });
  let active = false, brake = 0;
  input.setMobileProvider(() => ({active,throttle: active ? 1 : 0,brake,steer:0,drift:false}));
  assert.equal(input.getInput().throttle, 0);
  active = true;
  assert.equal(input.getInput().throttle, 1);
  assert.equal(input.peekThrottle(), 0);
  brake = 1;
  assert.equal(input.getInput().throttle, 0);
  assert.equal(input.getInput().brake, 1);
  input.triggerAction('item');
  assert.equal(input.getInput().item, true);
  assert.equal(input.getInput().item, false);
  input.dispose();
});
test('mobile item presses trigger once while the defensive hold lasts until release', () => {
  const input = new InputController({ target: new EventTarget() });
  let held = true, active = true;
  input.setMobileProvider(() => ({ active, itemHeld: held }));
  input.triggerAction('item');
  const press = input.getInput();
  assert.equal(press.item, true);
  assert.equal(press.itemHeld, true);
  const hold = input.getInput();
  assert.equal(hold.item, false);
  assert.equal(hold.itemHeld, true);
  held = false;
  assert.equal(input.getInput().itemHeld, false);
  held = true;
  active = false;
  assert.equal(input.getInput().itemHeld, false);
  input.dispose();
});
test('tilt uses screen orientation and a deadzone', () => {
  assert.equal(screenTilt(20, 8, 0), 8);
  assert.ok(Math.abs(screenTilt(20, 8, 90) - 20) < 1e-9);
  assert.ok(Math.abs(screenTilt(20, 8, -90) + 20) < 1e-9);
  assert.equal(tiltSteer(1), 0);
  assert.equal(tiltSteer(24), 1);
  assert.equal(tiltSteer(-24), -1);
});
test('touch steering has a stable center, progressive response and bounded full lock', () => {
  assert.equal(touchSteer(0), 0);
  assert.equal(touchSteer(5), 0);
  assert.equal(touchSteer(60), 1);
  assert.equal(touchSteer(-600), -1);
  assert.ok(touchSteer(30) > 0 && touchSteer(30) < 0.5);
  assert.equal(touchSteer(-30), -touchSteer(30));
  assert.ok(touchSteer(45) > touchSteer(30));
  assert.equal(touchSteer(NaN), 0);
  assert.equal(touchSteer(30, 0), 0);
});
test('mobile drift meter follows the three physics thresholds without overflow', () => {
  const thresholds = PHYSICS.driftChargeThresholds;
  assert.equal(driftProgress(0), 0);
  assert.equal(driftProgress(-1), 0);
  assert.equal(driftProgress(thresholds[0] / 2), 1 / 6);
  thresholds.forEach((threshold, index) => assert.equal(driftProgress(threshold), (index + 1) / thresholds.length));
  assert.equal(driftProgress(99), 1);
  assert.equal(driftProgress(NaN), 0);
});
test('a centered touch overrides gyro until the steering finger is released', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { hidden: false };
  try {
    const controls = Object.assign(Object.create(MobileControls.prototype), {
      enabled: true, state: 'racing', held: new Map(), steeringPointer: 1,
      touch: 0, tiltEnabled: true, tilt: 0.75, lastSensor: performance.now(),
    });
    assert.equal(controls.getInput().steer, 0);
    controls.touch = -0.4;
    assert.equal(controls.getInput().steer, -0.4);
    controls.steeringPointer = null;
    controls.touch = 0;
    assert.equal(controls.getInput().steer, 0.75);
    controls.lastSensor = performance.now() - 1500;
    assert.equal(controls.getInput().steer, 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
test('starting a race recenters controls without requesting sensor permission', () => {
  let recentered = false;
  MobileControls.prototype.prepareRace.call({
    enabled: true,
    recenter() { recentered = true; },
    enableTilt() { assert.fail('gyro must be explicitly enabled'); },
  });
  assert.equal(recentered, true);
});
test('gamepad menu navigation releases synthetic keyboard acceleration and steering', () => {
  const window = globalThis.window = new EventTarget();
  globalThis.KeyboardEvent = class extends Event { constructor(type, init) { super(type); this.code=init.code; } };
  const pad = { connected:true,axes:[0,-1],buttons:Array.from({length:16},()=>({pressed:false})) };
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[pad]}});
  const input = new InputController({target:window});
  const menu = Object.assign(Object.create(Menu.prototype),{screen:'select',_pad:{prev:{},repeatT:0}});
  menu.update(1/60,'select');
  pad.axes=[0,0]; menu.update(1/60,'select');
  assert.equal(input.getInput().throttle,0);
  pad.axes=[1,0]; menu.update(1/60,'select');
  pad.axes=[0,0]; menu.update(1/60,'select');
  assert.equal(input.isPressed('right'),false);
  input.dispose();
});

test('native gravity projects consistently in both landscape orientations', () => {
  assert.ok(Math.abs(gravityTilt({x:-1,y:0},90)) < 1e-9);
  assert.ok(Math.abs(gravityTilt({x:1,y:0},270)) < 1e-9);
  assert.ok(Math.abs(gravityTilt({x:0,y:-1},0)) < 1e-9);
  assert.equal(gravityTilt({x:0,y:0},0),null);
  assert.ok(gravityTilt({x:0.3,y:-0.9},0) > 15);
});

test('back walks the menu flow Driver → Course → Class → Mode → Title, then lets the app exit', () => {
  const shown = [];
  const menu = Object.assign(Object.create(Menu.prototype), { screen: 'select', h: {}, settingsReturn: 'title', _show(name) { shown.push(name); this.screen = name; } });
  while (menu.back()) { /* walk */ }
  assert.deepEqual(shown, ['course', 'class', 'mode', 'title']);
  assert.equal(menu.back(), false, 'at the title the Android back button may exit the app');
  menu.screen = 'settings'; menu.settingsReturn = 'pause';
  menu.back();
  assert.equal(menu.screen, 'pause');
  menu.screen = 'credits'; menu.back();
  assert.equal(menu.screen, 'settings');
  let resumed = false;
  menu.screen = 'pause'; menu.h = { onResume: () => { resumed = true; } };
  menu.back();
  assert.equal(resumed, true);
});

test('settings-driven tilt does not echo back, a toolbar toggle reports the new steering mode', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { isSecureContext: false };
  const reported = [];
  const fake = (enabled) => Object.assign(Object.create(MobileControls.prototype), {
    enabled, tiltEnabled: false, status: { textContent: '' }, sensorButton: { textContent: '', setAttribute() {} },
    onSteeringChange: (m) => reported.push(m), recenter() {},
  });
  try {
    const off = fake(false);
    assert.equal(off.ensureTilt(), undefined, 'no sensor request when touch controls are disabled');
    const on = fake(true);
    on.tiltEnabled = true;
    await on.enableTilt(false);
    assert.equal(on.tiltEnabled, false);
    assert.deepEqual(reported, ['touch']);
    on.tiltEnabled = true;
    await on.disableTilt();
    assert.deepEqual(reported, ['touch'], 'settings-driven changes are not echoed');
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});
