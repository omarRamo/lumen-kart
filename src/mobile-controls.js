import { isNativeMotionAvailable, startNativeMotion } from './native-motion.js';
import { PHYSICS } from './config.js';
import { itemIcon, svgIcon } from './icons.js';
import { t, itemLabel } from './i18n.js';
// Mobile input layer. Instantiate once: new MobileControls({ input, parent, onPause }).
// Call updateState(mainState) whenever the game state changes; dispose on shutdown.
// Auto throttle deliberately starts only in racing, and is excluded from peekThrottle,
// so the countdown's rocket-start logic cannot punish mobile players for holding gas.
export function screenTilt(beta, gamma, angle = 0) {
  const r = angle * Math.PI / 180;
  return gamma * Math.cos(r) + beta * Math.sin(r);
}

export function gravityTilt({ x, y }, angle = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.15) return null;
  const radians = angle * Math.PI / 180;
  return Math.atan2(x * Math.cos(radians) - y * Math.sin(radians), -(x * Math.sin(radians) + y * Math.cos(radians))) * 180 / Math.PI;
}

export function tiltSteer(delta, deadzone = 2, fullLock = 24) {
  if (Math.abs(delta) <= deadzone) return 0;
  return Math.sign(delta) * Math.min(1, (Math.abs(delta) - deadzone) / (fullLock - deadzone));
}

export function touchSteer(offset, fullLock = 60) {
  if (!Number.isFinite(offset) || !Number.isFinite(fullLock) || fullLock <= 6) return 0;
  const amount = Math.min(1, Math.max(0, (Math.abs(offset) - 6) / (fullLock - 6)));
  return Math.sign(offset) * amount ** 1.35;
}

export function driftProgress(charge) {
  if (!Number.isFinite(charge)) return 0;
  let progress = 0, previous = 0;
  for (const threshold of PHYSICS.driftChargeThresholds) {
    progress += Math.min(1, Math.max(0, (charge - previous) / (threshold - previous)));
    previous = threshold;
  }
  return progress / PHYSICS.driftChargeThresholds.length;
}

export class MobileControls {
  constructor({ input, parent = document.body, onPause = () => input.triggerAction('pause'), enabled, onSteeringChange } = {}) {
    this.input = input;
    this.onSteeringChange = onSteeringChange || null;
    this.enabled = enabled ?? (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
    this.state = 'boot';
    this.held = new Map();
    this.steeringPointer = null;
    this.touch = 0;
    this.tiltEnabled = false;
    this.center = null;
    this.tilt = 0;
    this.lastSensor = 0;
    this.abort = new AbortController();
    this.root = document.createElement('div');
    this.root.className = 'mobile-controls';
    this.root.innerHTML = `<div class="mobile-toolbar"><button type="button" class="mobile-small mobile-sensor" data-testid="touch-tilt" aria-pressed="false"></button><button type="button" class="mobile-small mobile-calibrate">${svgIcon('recenter')}</button><button type="button" class="mobile-small mobile-pause" data-testid="touch-pause">${svgIcon('pause')}</button></div>
      <div class="mobile-status" role="status"></div>
      <div class="mobile-steering" data-testid="touch-steering" role="slider" tabindex="0" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><span class="mobile-arrow l" aria-hidden="true">${svgIcon('back')}</span><span class="mobile-stick" aria-hidden="true"></span><span class="mobile-arrow r" aria-hidden="true">${svgIcon('back')}</span></div>
      <div class="mobile-actions">
        <button type="button" class="mobile-item" data-hold="item" data-testid="touch-item" disabled><img class="mobile-item-icon" alt="" hidden><span class="mobile-item-empty" aria-hidden="true">?</span><span class="mobile-item-count" aria-hidden="true"></span></button>
        <button type="button" data-hold="drift" data-testid="touch-drift"><span class="mobile-drift-label"></span><span class="mobile-charge" aria-hidden="true"><span></span></span></button>
        <button type="button" data-hold="brake" data-testid="touch-brake"><span class="mobile-brake-label"></span></button>
      </div>`;
    parent.appendChild(this.root);
    this.status = this.root.querySelector('.mobile-status');
    this.sensorButton = this.root.querySelector('.mobile-sensor');
    this.steering = this.root.querySelector('.mobile-steering');
    this.itemButton = this.root.querySelector('.mobile-item');
    this.itemImage = this.root.querySelector('.mobile-item-icon');
    this.itemEmpty = this.root.querySelector('.mobile-item-empty');
    this.itemCount = this.root.querySelector('.mobile-item-count');
    this.driftButton = this.root.querySelector('[data-hold=drift]');
    this.driftLabel = this.root.querySelector('.mobile-drift-label');
    const on = (el, name, fn) => el.addEventListener(name, fn, { signal: this.abort.signal });
    on(this.steering, 'pointerdown', e => {
      if (this.steeringPointer !== null || e.button !== 0) return;
      e.preventDefault();
      this.steering.setPointerCapture(e.pointerId);
      this.steeringPointer = e.pointerId;
      this.steeringOrigin = e.clientX;
      this.steering.classList.add('held');
      this.setTouch(0);
    });
    on(this.steering, 'pointermove', e => {
      if (e.pointerId === this.steeringPointer) this.setTouch(touchSteer(e.clientX - this.steeringOrigin));
    });
    const releaseSteering = e => {
      if (e.pointerId !== this.steeringPointer) return;
      this.steeringPointer = null;
      this.steering.classList.remove('held');
      this.setTouch(0);
    };
    on(this.steering, 'pointerup', releaseSteering);
    on(this.steering, 'pointercancel', releaseSteering);
    on(this.steering, 'lostpointercapture', releaseSteering);
    on(this.steering, 'keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
      e.preventDefault();
      this.setTouch(e.key === 'Home' ? 0 : e.key === 'ArrowLeft' ? -1 : 1);
    });
    on(this.steering, 'keyup', () => this.setTouch(0));
    on(this.steering, 'blur', () => this.setTouch(0));
    for (const button of this.root.querySelectorAll('[data-hold]')) {
      on(button, 'pointerdown', e => {
        if (button.disabled || e.button !== 0 || (button.dataset.hold === 'item' && this.state !== 'racing')) return;
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        const alreadyHeld = [...this.held.values()].includes(button.dataset.hold);
        this.held.set(e.pointerId, button.dataset.hold);
        button.classList.add('held');
        if (button.dataset.hold === 'item' && !alreadyHeld) this.input.triggerAction('item');
      });
      const release = e => {
        this.held.delete(e.pointerId);
        if (![...this.held.values()].includes(button.dataset.hold)) button.classList.remove('held');
      };
      on(button, 'pointerup', release);
      on(button, 'pointercancel', release);
      on(button, 'lostpointercapture', release);
    }
    on(this.root.querySelector('.mobile-item'), 'click', e => {
      if (e.detail === 0 && this.state === 'racing') this.input.triggerAction('item');
    });
    on(this.root.querySelector('.mobile-pause'), 'click', onPause);
    on(this.sensorButton, 'click', () => this.enableTilt(false));
    on(this.root.querySelector('.mobile-calibrate'), 'click', () => this.recenter());
    on(window, 'blur', () => this.release());
    on(document, 'visibilitychange', () => { if (document.hidden) this.release(); });
    on(window, 'orientationchange', () => this.recenter());
    if (screen.orientation) on(screen.orientation, 'change', () => this.recenter());
    on(window, 'deviceorientation', e => this.orientation(e));
    this.input?.setMobileProvider?.(() => this.getInput());
    document.body.classList.toggle('mobile-mode', this.enabled);
    this.relabel();
    this.updateState('boot');
  }

  /** Re-apply translated labels (language switch). */
  relabel() {
    const q = (s) => this.root.querySelector(s);
    this._setSensorLabel();
    q('.mobile-calibrate').setAttribute('aria-label', t('mobile.recenter'));
    q('.mobile-calibrate').title = t('mobile.recenter');
    q('.mobile-pause').setAttribute('aria-label', t('mobile.pause'));
    q('.mobile-pause').title = t('mobile.pause');
    this.steering.setAttribute('aria-label', t('mobile.steering'));
    q('.mobile-brake-label').textContent = t('mobile.brake');
    q('[data-hold=brake]').setAttribute('aria-label', t('mobile.brake'));
    this.lastItemKey = null;
    this.lastDriftKey = null;
    if (this.driftLabel) this.driftLabel.textContent = t('mobile.drift');
    if (!this.itemButton.getAttribute('aria-label')) this.itemButton.setAttribute('aria-label', t('mobile.noItem'));
  }
  _setSensorLabel() {
    this.sensorButton.textContent = t(this.tiltEnabled ? 'mobile.gyroOn' : 'mobile.gyroOff');
    this.sensorButton.setAttribute('aria-pressed', String(!!this.tiltEnabled));
  }
  /** Settings asked for tilt steering: enable it (must run from a user gesture on iOS). */
  ensureTilt() { if (this.enabled && !this.tiltEnabled) return this.enableTilt(true); }
  disableTilt() { if (this.tiltEnabled) return this.enableTilt(true); }

  setTouch(value) {
    this.touch = value;
    this.steering.style.setProperty('--steer', value);
    this.steering.setAttribute('aria-valuenow', Math.round(value * 100));
  }

  updateState(state) {
    if (state !== this.state) this.release();
    this.state = state;
    this.root.hidden = !this.enabled || !['racing', 'countdown'].includes(state);
  }

  updateRace(player, itemSystem) {
    if (!this.enabled || this.root.hidden || !player) return;
    const roulette = itemSystem?.rouletteState?.(player);
    const spinning = !!roulette?.spinning;
    const item = spinning ? roulette.displayItem : player.item;
    const count = item && !spinning ? player.itemCount || 1 : 0;
    const itemKey = `${item}:${count}:${spinning}`;
    if (itemKey !== this.lastItemKey) {
      this.lastItemKey = itemKey;
      this.itemImage.hidden = !item;
      this.itemEmpty.hidden = !!item;
      if (item) this.itemImage.src = itemIcon(item);
      this.itemCount.textContent = count > 1 ? `×${count}` : '';
      this.itemButton.classList.toggle('spinning', spinning);
      const label = spinning ? t('mobile.choosing') : item ? `${t('mobile.use', { item: itemLabel(item) })}${count > 1 ? ` ×${count}` : ''}` : t('mobile.noItem');
      this.itemButton.setAttribute('aria-label', label);
      this.itemButton.title = label;
    }
    this.itemButton.disabled = this.state !== 'racing' || !player.item || spinning || !!player.controlsLocked || !!player.finished
      || player.rocketTimer > 0 || player.fallTimer > 0 || player.respawnTimer > 0;

    const level = player.drifting ? Math.min(3, Math.max(0, player.driftLevel | 0)) : 0;
    const boosting = player.boostTimer > 0;
    const label = player.drifting ? (level ? t('hud.drift.' + level).toUpperCase() : t('mobile.drift')) : boosting ? t('mobile.boost') : t('mobile.drift');
    const progress = Math.round((player.drifting ? driftProgress(player.driftCharge) : boosting ? 1 : 0) * 100);
    const driftKey = `${label}:${progress}`;
    if (driftKey !== this.lastDriftKey) {
      this.lastDriftKey = driftKey;
      this.driftButton.dataset.level = level;
      this.driftButton.classList.toggle('boosting', boosting && !player.drifting);
      this.driftButton.style.setProperty('--charge', progress / 100);
      this.driftLabel.textContent = label;
      this.driftButton.setAttribute('aria-label', level ? `${t('mobile.drift')} · ${label}` : boosting ? `${t('mobile.drift')} · ${t('mobile.boost')}` : t('mobile.drift'));
    }
  }

  release() {
    this.held.clear();
    this.steeringPointer = null;
    this.setTouch(0);
    this.root.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
  }

  recenter() {
    this.release();
    this.center = null;
    this.tilt = 0;
    if (this.tiltEnabled) this.status.textContent = t('mobile.centering');
  }

  prepareRace() {
    this.recenter();
  }

  /** Toggle tilt steering. `fromSettings` = called by the settings flow (don't echo back). */
  async enableTilt(fromSettings = false) {
    const notify = (mode) => { if (!fromSettings) { try { this.onSteeringChange?.(mode); } catch { /* ignore */ } } };
    if (this.tiltEnabled) {
      this.tiltEnabled = false;
      this.nativeStop?.(); this.nativeStop = null;
      this._setSensorLabel();
      this.status.textContent = '';
      clearTimeout(this.sensorTimeout);
      notify('touch');
      return;
    }
    try {
      if (isNativeMotionAvailable()) {
        this.tiltEnabled = true;
        this.lastSensor = 0;
        this._setSensorLabel();
        this.recenter();
        notify('tilt');
        const stop = await startNativeMotion(gravity => {
          const value = gravityTilt(gravity, screen.orientation?.angle ?? window.orientation ?? 0);
          if (value !== null && this.tiltEnabled) this.acceptTilt(value);
        });
        if (!this.tiltEnabled) { await stop(); return; }
        this.nativeStop = stop;
        return;
      }
      if (!window.isSecureContext || !window.DeviceOrientationEvent) throw new Error('unavailable');
      // Must run directly from a user activation on iOS.
      const permission = typeof DeviceOrientationEvent.requestPermission === 'function'
        ? await DeviceOrientationEvent.requestPermission() : 'granted';
      if (permission !== 'granted') throw new Error('denied');
      this.tiltEnabled = true;
      this.lastSensor = 0;
      this._setSensorLabel();
      this.recenter();
      notify('tilt');
      this.sensorTimeout = setTimeout(() => {
        if (!this.lastSensor) {
          this.status.textContent = t('mobile.noSignal');
          this.tiltEnabled = false;
          this._setSensorLabel();
        }
      }, 3000);
    } catch {
      this.tiltEnabled = false;
      this._setSensorLabel();
      this.status.textContent = t('mobile.gyroUnavailable');
    }
  }

  orientation(e) {
    if (!this.tiltEnabled || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    const value = screenTilt(e.beta, e.gamma, angle);
    this.acceptTilt(value);
  }

  acceptTilt(value) {
    if (this.center === null) {
      this.center = value;
      this.status.textContent = '';
    }
    this.tilt = tiltSteer(((value - this.center + 540) % 360) - 180);
    this.lastSensor = performance.now();
  }

  getInput() {
    const held = new Set(this.held.values());
    const active = this.enabled && this.state === 'racing' && !document.hidden;
    const sensor = this.tiltEnabled && performance.now() - this.lastSensor < 1000 ? this.tilt : 0;
    return { active, throttle: active && !held.has('brake') ? 1 : 0, brake: held.has('brake') ? 1 : 0,
      steer: this.steeringPointer !== null || this.touch !== 0 ? this.touch : sensor,
      drift: held.has('drift'), itemHeld: held.has('item') };
  }

  dispose() {
    this.nativeStop?.();
    this.abort.abort();
    clearTimeout(this.sensorTimeout);
    this.input?.setMobileProvider?.(null);
    this.root.remove();
    document.body.classList.remove('mobile-mode');
  }
}
