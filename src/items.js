// Items: item boxes, roulette, projectiles & hazards. See ARCHITECTURE.md §3.
import * as THREE from 'three';
import { PHYSICS, ITEMS } from './config.js';
import { bus } from './events.js';

// models.js is owned by another agent; load it defensively so a missing/broken module never breaks items.
let createItemModelFn = null;
try {
  const mod = await import('./models.js');
  if (typeof mod.createItemModel === 'function') createItemModelFn = mod.createItemModel;
} catch (err) {
  console.warn('[items] models.js unavailable, using fallback item meshes', err?.message || err);
}

// ---------------------------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------------------------
const BOX_RESPAWN = 2.0;
const BOX_SCALE_IN = 0.4;
const BOX_PICK_RADIUS = 1.2;
const ROULETTE_PLAYER = 1.6;
const ROULETTE_AI_MIN = 0.45;
const ROULETTE_AI_MAX = 0.9;
const USE_COOLDOWN = 0.28;
const OWNER_GRACE = 0.4;

const SHELL_RADIUS = 0.75;
const SHELL_HOVER = 0.05;          // extra clearance of shell bottom above ground
const GREEN_SPEED = 62;
const GREEN_LIFE = 8;
const GREEN_BOUNCES = 5;
const RED_SPEED = 58;
const RED_LIFE = 11;
const RED_TURN = 6.5;              // rad/s steering
const RED_DIRECT_DIST = 28;
const BLUE_SPEED = 78;
const BLUE_ALT = 7;
const BLUE_LIFE = 30;
const BLUE_HOVER_TIME = 1.0;
const BLUE_RADIUS = 8;
const BANANA_RADIUS = 0.75;
const MAX_BANANAS = 24;
const MAX_SHELLS = 24;
const BOMB_RADIUS = 0.8;
const BOMB_BLAST = 9;
const BOMB_FUSE = 3.2;
const HORN_RADIUS = 12;
const ORBIT_RADIUS = 2.1;
const ROCKET_TIME = 5.5;
const GHOST_TIME = 6;

// Weighted distribution by place (1..8). Columns follow ITEM_ORDER.
const ITEM_ORDER = ['coin', 'banana', 'triple_banana', 'green_shell', 'triple_green', 'red_shell', 'mushroom', 'triple_mushroom',
  'bomb', 'ghost', 'star', 'bullet', 'lightning', 'blue_shell', 'horn'];
const WEIGHTS = [
  //       coin ban 3ban grn 3grn red mush 3msh bomb ghst star bull ltng blue horn
  /*1*/ [22, 26, 10, 20, 6, 0, 4, 0, 0, 2, 0, 0, 0, 0, 10],
  /*2*/ [8, 14, 8, 14, 10, 18, 10, 2, 6, 4, 1, 0, 0, 2, 3],
  /*3*/ [4, 8, 6, 10, 10, 22, 14, 6, 8, 4, 3, 0, 0, 3, 2],
  /*4*/ [2, 4, 4, 6, 8, 24, 16, 12, 8, 4, 5, 1, 1, 3, 2],
  /*5*/ [0, 2, 2, 4, 6, 22, 16, 18, 6, 3, 8, 5, 2, 3, 1],
  /*6*/ [0, 0, 0, 2, 4, 18, 14, 24, 4, 2, 12, 10, 4, 4, 1],
  /*7*/ [0, 0, 0, 0, 2, 12, 10, 26, 2, 2, 16, 16, 6, 3, 0],
  /*8*/ [0, 0, 0, 0, 0, 8, 8, 26, 0, 0, 18, 24, 10, 3, 0],
];
const TRIPLES = { triple_mushroom: 'mushroom', triple_banana: 'banana', triple_green: 'green_shell' };
const DRAGGABLE = new Set(['banana', 'green_shell', 'red_shell']);
const ROULETTE_CYCLE = ITEMS && ITEMS.length ? ITEMS : ITEM_ORDER;

// Model normalization targets (max dimension in meters)
const MODEL_SIZE = { item_box: 1.7, banana: 1.0, green_shell: 1.1, red_shell: 1.1, blue_shell: 1.5, bomb: 1.5 };

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _box = new THREE.Box3();

function finite(n, d = 0) { return Number.isFinite(n) ? n : d; }
function wrap01(t) { t %= 1; return t < 0 ? t + 1 : t; }
function kartForward(kart, out) {
  const h = finite(kart.heading, kart.object3D?.rotation?.y ?? 0);
  return out.set(Math.sin(h), 0, Math.cos(h));
}
function kartRadius(kart) { return finite(kart.radius, PHYSICS.kartRadius); }

// ---------------------------------------------------------------------------------------------
// Fallback models (used when models.js is missing or throws)
// ---------------------------------------------------------------------------------------------
let fallbackCache = null;
function getFallbackAssets() {
  if (fallbackCache) return fallbackCache;
  // "?" texture for boxes
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#ff5ca8'); grad.addColorStop(0.33, '#ffd84a');
  grad.addColorStop(0.66, '#4ae3ff'); grad.addColorStop(1, '#9b6bff');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(8, 8, 112, 112);
  g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#ffffff'; g.font = 'bold 92px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#6a2fb8'; g.strokeText('?', 64, 70); g.fillText('?', 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  fallbackCache = {
    tex,
    boxGeo: new THREE.BoxGeometry(1.5, 1.5, 1.5),
    boxMat: new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0.85, emissive: 0x442266, emissiveIntensity: 0.4, roughness: 0.2 }),
    shellGeo: new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    rimGeo: new THREE.TorusGeometry(0.55, 0.14, 8, 20),
    rimMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2ecc40, roughness: 0.35 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe8262a, roughness: 0.35 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x2f6bff, roughness: 0.3, emissive: 0x0a1a66, emissiveIntensity: 0.6 }),
    spikeGeo: new THREE.ConeGeometry(0.14, 0.4, 8),
    wingGeo: new THREE.BoxGeometry(0.9, 0.05, 0.35),
    wingMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    bananaGeo: new THREE.TorusGeometry(0.4, 0.14, 8, 16, Math.PI * 1.1),
    bananaMat: new THREE.MeshStandardMaterial({ color: 0xffe135, roughness: 0.5 }),
    tipMat: new THREE.MeshStandardMaterial({ color: 0x5a3a12, roughness: 0.8 }),
    tipGeo: new THREE.SphereGeometry(0.08, 6, 6),
  };
  return fallbackCache;
}

function buildFallbackModel(type) {
  const a = getFallbackAssets();
  const root = new THREE.Group();
  if (type === 'item_box') {
    const m = new THREE.Mesh(a.boxGeo, a.boxMat);
    root.add(m);
  } else if (type === 'banana') {
    const m = new THREE.Mesh(a.bananaGeo, a.bananaMat);
    m.rotation.z = Math.PI * 0.95;
    m.position.y = 0.5;
    const tip = new THREE.Mesh(a.tipGeo, a.tipMat);
    tip.position.set(0.4, 0, 0);
    m.add(tip);
    root.add(m);
  } else {
    const mat = type === 'red_shell' ? a.red : type === 'blue_shell' ? a.blue : a.green;
    const dome = new THREE.Mesh(a.shellGeo, mat);
    dome.position.y = 0.15;
    const rim = new THREE.Mesh(a.rimGeo, a.rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.15;
    root.add(dome, rim);
    if (type === 'blue_shell') {
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(a.spikeGeo, a.rimMat);
        const ang = (i / 6) * Math.PI * 2;
        s.position.set(Math.cos(ang) * 0.3, 0.55, Math.sin(ang) * 0.3);
        s.rotation.set(Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5);
        root.add(s);
      }
      const w1 = new THREE.Mesh(a.wingGeo, a.wingMat); w1.position.set(0.7, 0.4, 0); w1.rotation.z = 0.4;
      const w2 = new THREE.Mesh(a.wingGeo, a.wingMat); w2.position.set(-0.7, 0.4, 0); w2.rotation.z = -0.4;
      root.add(w1, w2);
    }
  }
  root.userData.fallback = true;
  return root;
}

// Wraps a model in a holder whose origin is the model's bottom-centre (or centre for boxes),
// normalized to a sensible size.
export function buildItemVisual(type) {
  let model = null;
  if (createItemModelFn) {
    try {
      const m = createItemModelFn(type);
      if (m && m.isObject3D) model = m;
      else if (m && m.root && m.root.isObject3D) model = m.root;
    } catch (err) {
      console.warn('[items] createItemModel failed for', type, err);
    }
  }
  const isFallback = !model;
  if (!model) model = buildFallbackModel(type);
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(model);
  holder.add(inner);
  try {
    model.updateMatrixWorld(true);
    _box.setFromObject(model);
    if (!_box.isEmpty()) {
      _box.getSize(_v1);
      const maxDim = Math.max(_v1.x, _v1.y, _v1.z);
      const target = MODEL_SIZE[type] || 1;
      let s = 1;
      if (maxDim > 0 && (maxDim > target * 1.8 || maxDim < target * 0.45)) s = target / maxDim;
      inner.scale.setScalar(s);
      _box.getCenter(_v2);
      if (type === 'item_box') model.position.sub(_v2);
      else model.position.set(model.position.x - _v2.x, model.position.y - _box.min.y, model.position.z - _v2.z);
    }
  } catch (_) { /* ignore */ }
  if (isFallback) holder.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  holder.userData.fallback = isFallback;
  holder.userData.type = type;
  holder.userData.inner = inner;
  return holder;
}

// ---------------------------------------------------------------------------------------------
// ItemSystem
// ---------------------------------------------------------------------------------------------
export class ItemSystem {
  constructor({ scene, track, karts, noBoxes = false }) {
    this.scene = scene;
    this.track = track;
    this.karts = karts || [];
    this.group = new THREE.Group();
    this.group.name = 'ItemSystem';
    scene?.add(this.group);
    this.time = 0;

    this.boxes = [];
    this.entities = [];   // active projectiles/hazards
    this.pools = new Map(); // type -> holder[]
    this.roulettes = new Map(); // kart -> { timer, duration, display, cycleTimer, final }
    this.kartState = new Map(); // kart -> { prevItem, cooldown }
    this._hazards = [];
    this._rouletteOut = { spinning: false, displayItem: null };
    this.extraHazards = null;          // optional () => hazard[] (track hazards) merged into getHazards()
    this.held = new Map();             // kart -> { holders: [], type }

    const positions = noBoxes ? [] : (track?.itemBoxPositions || []);
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      if (!p) continue;
      const base = new THREE.Vector3(finite(p.x), finite(p.y), finite(p.z));
      try {
        const info = track.getSurfaceInfo?.(base);
        if (info && Number.isFinite(info.height) && base.y < info.height + 1.1) base.y = info.height + 1.3;
      } catch (_) { /* ignore */ }
      const holder = buildItemVisual('item_box');
      holder.position.copy(base);
      this.group.add(holder);
      this.boxes.push({ base, holder, active: true, timer: 0, scaleT: 1, phase: i * 0.7 });
    }
  }

  // ------------------------------------------------------------------ public API
  update(dt, time) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.time = Number.isFinite(time) ? time : this.time + dt;
    try { this._updateBoxes(dt); } catch (err) { console.error('[items] boxes', err); }
    try { this._updateRoulettes(dt); } catch (err) { console.error('[items] roulette', err); }
    try { this._updateUse(dt); } catch (err) { console.error('[items] use', err); }
    try { this._updateEntities(dt); } catch (err) { console.error('[items] entities', err); }
    try { this._updateHeld(dt); } catch (err) { console.error('[items] held', err); }
  }

  getHazards() {
    const out = this._hazards;
    out.length = 0;
    for (const e of this.entities) {
      if (e.dead || !e.hazard) continue;
      if (e.type === 'blue_shell') continue;
      if ((e.type === 'banana' || e.type === 'bomb') && e.flying) continue;
      out.push(e.hazard);
    }
    if (this.extraHazards) {
      try { const ex = this.extraHazards(); if (ex) for (const h of ex) out.push(h); } catch (_) { /* ignore */ }
    }
    return out;
  }

  rouletteState(kart) {
    const o = this._rouletteOut;
    const r = kart ? this.roulettes.get(kart) : null;
    if (r) { o.spinning = true; o.displayItem = r.display; }
    else { o.spinning = false; o.displayItem = kart?.item ?? null; }
    o.count = kart?.itemCount ?? 0;
    return o;
  }

  dispose() {
    for (const e of this.entities) this._release(e.holder);
    for (const hv of this.held.values()) for (const h of hv.holders) this._release(h);
    this.held.clear();
    this.entities.length = 0;
    this.roulettes.clear();
    this.kartState.clear();
    this.scene?.remove(this.group);
    const seen = new Set();
    const disposeOnce = (obj) => {
      obj.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose?.(); }
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) if (!seen.has(m)) { seen.add(m); m.map?.dispose?.(); m.dispose?.(); }
      });
    };
    // models.js caches/shares geometry & materials between instances, so only dispose our own fallbacks
    for (const b of this.boxes) if (b.holder.userData.fallback) disposeOnce(b.holder);
    for (const list of this.pools.values()) for (const h of list) if (h.userData.fallback) disposeOnce(h);
    this.boxes.length = 0;
    this.pools.clear();
    if (fallbackCache) {
      // shared fallback assets: dispose & rebuild lazily next race
      Object.values(fallbackCache).forEach((x) => x?.dispose?.());
      fallbackCache = null;
    }
  }

  // ------------------------------------------------------------------ boxes
  _updateBoxes(dt) {
    const t = this.time;
    for (const b of this.boxes) {
      const h = b.holder;
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) { b.active = true; b.scaleT = 0; h.visible = true; }
        else continue;
      }
      if (b.scaleT < 1) b.scaleT = Math.min(1, b.scaleT + dt / BOX_SCALE_IN);
      // easeOutBack
      const x = b.scaleT, c1 = 1.9, c3 = c1 + 1;
      const s = x >= 1 ? 1 : Math.max(0.001, 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2));
      h.scale.setScalar(s);
      h.position.set(b.base.x, b.base.y + Math.sin(t * 2.4 + b.phase) * 0.22, b.base.z);
      h.rotation.set(Math.sin(t * 1.3 + b.phase) * 0.35, t * 1.6 + b.phase, Math.cos(t * 1.1 + b.phase) * 0.25);

      if (b.scaleT < 0.5) continue;
      for (const k of this.karts) {
        if (!k || !k.position) continue;
        const r = kartRadius(k) + BOX_PICK_RADIUS;
        const dx = k.position.x - b.base.x, dz = k.position.z - b.base.z;
        const dy = (k.position.y + 0.6) - b.base.y;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 2.6) {
          this._pickupBox(b, k);
          break;
        }
      }
    }
  }

  _pickupBox(b, kart) {
    b.active = false;
    b.timer = BOX_RESPAWN;
    b.holder.visible = false;
    bus.emit('item:pickup', { kart, position: b.base });
    if (kart.item == null && !this.roulettes.has(kart) && !kart.finished) {
      const final = this._rollItem(kart);
      const dur = kart.isPlayer ? ROULETTE_PLAYER : ROULETTE_AI_MIN + Math.random() * (ROULETTE_AI_MAX - ROULETTE_AI_MIN);
      this.roulettes.set(kart, { timer: 0, duration: dur, final, display: ROULETTE_CYCLE[(Math.random() * ROULETTE_CYCLE.length) | 0], cycleTimer: 0 });
      bus.emit('item:roulette', { kart });
    }
  }

  _rollItem(kart) {
    const n = Math.max(1, this.karts.length);
    let place = finite(kart.place, Math.ceil(n / 2));
    place = Math.min(Math.max(place, 1), n);
    // map place onto the 8-row table
    const row = n <= 1 ? 3 : Math.round(((place - 1) / (n - 1)) * 7);
    const weights = WEIGHTS[Math.min(7, Math.max(0, row))];
    const blueActive = this.entities.some((e) => e.type === 'blue_shell' && !e.dead)
      || this.karts.some((k) => k && k.item === 'blue_shell');
    const lightningHeld = this.karts.some((k) => k && k.item === 'lightning');
    const banned = (it) => (it === 'blue_shell' && (blueActive || place === 1)) || (it === 'lightning' && lightningHeld)
      || (it === 'bullet' && place <= 2);
    let total = 0;
    for (let i = 0; i < ITEM_ORDER.length; i++) if (!banned(ITEM_ORDER[i])) total += weights[i];
    let r = Math.random() * total;
    for (let i = 0; i < ITEM_ORDER.length; i++) {
      if (banned(ITEM_ORDER[i])) continue;
      r -= weights[i];
      if (r <= 0) return ITEM_ORDER[i];
    }
    return 'banana';
  }

  _updateRoulettes(dt) {
    for (const [kart, r] of this.roulettes) {
      r.timer += dt;
      r.cycleTimer -= dt;
      const remaining = r.duration - r.timer;
      if (r.cycleTimer <= 0) {
        // slow down near the end
        r.cycleTimer = remaining < 0.4 ? 0.14 : 0.07;
        let idx = ROULETTE_CYCLE.indexOf(r.display);
        idx = (idx + 1 + ((Math.random() * 2) | 0)) % ROULETTE_CYCLE.length;
        r.display = ROULETTE_CYCLE[idx];
      }
      if (r.timer >= r.duration) {
        this.roulettes.delete(kart);
        kart.item = r.final;
        kart.itemCount = TRIPLES[r.final] ? 3 : 1;
        this._getState(kart).cooldown = 0.2; // avoid instant-fire if the button is still being tapped
        bus.emit('item:got', { kart, item: r.final });
      }
    }
  }

  _getState(kart) {
    let s = this.kartState.get(kart);
    if (!s) { s = { prevItem: false, cooldown: 0, dragging: false, dragItem: null }; this.kartState.set(kart, s); }
    return s;
  }

  /** Give a kart an item directly (time trial mushrooms, debug). */
  giveItem(kart, item, count) {
    if (!kart) return;
    this.roulettes.delete(kart);
    kart.item = item;
    kart.itemCount = count || (TRIPLES[item] ? 3 : 1);
    bus.emit('item:got', { kart, item });
  }

  /** True while the kart trails/drags an item that can absorb a hit from behind. */
  isDragging(kart) { const s = this.kartState.get(kart); return !!(s && s.dragging); }

  // ------------------------------------------------------------------ using items
  _updateUse(dt) {
    for (const kart of this.karts) {
      if (!kart) continue;
      const s = this._getState(kart);
      s.cooldown = Math.max(0, s.cooldown - dt);
      const pressed = !!kart.input?.item;
      const held = kart.input?.itemHeld;
      const edge = pressed && !s.prevItem;
      s.prevItem = pressed;
      if (s.dragging) {
        if (kart.item !== s.dragItem || kart.spinTimer > 0 || kart.fallTimer > 0) { s.dragging = false; s.dragItem = null; continue; }
        if (!held) { s.dragging = false; s.dragItem = null; s.cooldown = USE_COOLDOWN; this._useItem(kart); }
        continue;
      }
      if (!edge || s.cooldown > 0) continue;
      if (kart.item == null || this.roulettes.has(kart)) continue;
      if (kart.controlsLocked && !kart.finished) continue;
      if (kart.rocketTimer > 0 || kart.fallTimer > 0 || kart.respawnTimer > 0) continue;
      if (DRAGGABLE.has(kart.item) && held === true) {
        s.dragging = true; s.dragItem = kart.item;
        bus.emit('item:drag', { kart, item: kart.item });
        continue;
      }
      s.cooldown = USE_COOLDOWN;
      this._useItem(kart);
    }
  }

  _useItem(kart) {
    const item = kart.item;
    const base = TRIPLES[item] || item;
    let steal = null;
    try {
      switch (base) {
        case 'mushroom': kart.applyBoost?.(PHYSICS.mushroomBoostTime, 1); break;
        case 'banana': this._spawnBanana(kart); break;
        case 'green_shell': this._spawnShell(kart, 'green_shell'); break;
        case 'red_shell': this._spawnShell(kart, 'red_shell'); break;
        case 'blue_shell': this._spawnBlue(kart); break;
        case 'star': kart.startStar?.(PHYSICS.starTime); break;
        case 'lightning': this._lightning(kart); break;
        case 'bomb': this._spawnBomb(kart); break;
        case 'bullet': kart.startRocket?.(ROCKET_TIME); break;
        case 'ghost': kart.startGhost?.(GHOST_TIME); steal = this._pickVictim(kart); break;
        case 'horn': this._horn(kart); break;
        case 'coin': kart.addCoins?.(2); kart.applyBoost?.(0.35, 0.55, 'coin'); break;
        default: break;
      }
    } catch (err) {
      console.error('[items] use failed', item, err);
    }
    bus.emit('item:use', { kart, item: base });
    const count = finite(kart.itemCount, 1) - 1;
    if (TRIPLES[item] && count > 0) {
      kart.itemCount = count;
    } else {
      kart.item = null;
      kart.itemCount = 0;
    }
    if (steal && steal.item != null && kart.item == null) {
      const it = steal.item, cnt = steal.itemCount;
      steal.item = null; steal.itemCount = 0;
      const st = this.kartState.get(steal); if (st) { st.dragging = false; st.dragItem = null; }
      kart.item = it; kart.itemCount = cnt || 1;
      this._getState(kart).cooldown = 0.6;
      bus.emit('item:steal', { kart, from: steal, item: it });
      bus.emit('item:got', { kart, item: it });
    }
  }

  _pickVictim(kart) {
    const cands = this.karts.filter((k) => k && k !== kart && k.item != null && !this.roulettes.has(k) && k.item !== 'ghost');
    if (!cands.length) return null;
    const ahead = cands.filter((k) => finite(k.place, 9) < finite(kart.place, 9));
    const pool = ahead.length ? ahead : cands;
    return pool[(Math.random() * pool.length) | 0];
  }

  _horn(by) {
    bus.emit('item:horn', { kart: by, position: by.position.clone(), radius: HORN_RADIUS });
    for (const k of this.karts) {
      if (!k || k === by || !k.position) continue;
      if (k.position.distanceToSquared(by.position) < HORN_RADIUS * HORN_RADIUS) this._hitKart(k, 'tumble', 'horn', by);
    }
    for (const e of this.entities) {
      if (e.dead) continue;
      const r = e.type === 'blue_shell' ? HORN_RADIUS + 6 : HORN_RADIUS;
      if (e.pos.distanceToSquared(by.position) < r * r && !(e.owner === by && e.age < 0.2)) {
        e.dead = true;
        bus.emit('item:explode', { position: e.pos.clone(), radius: e.type === 'blue_shell' ? 4 : 1.6, kind: e.type === 'blue_shell' ? 'blue_shell_defused' : 'small' });
      }
    }
  }

  _spawnBomb(kart) {
    const fwd = kartForward(kart, _v1);
    const back = !!kart.input?.lookBack;
    const r = kartRadius(kart);
    _v2.copy(kart.position).addScaledVector(fwd, back ? -(r + 1.4) : r + 1.6);
    _v2.y += 1.4;
    const e = this._makeEntity('bomb', kart, _v2);
    e.radius = BOMB_RADIUS;
    e.hazard.radius = BOMB_BLAST * 0.7;
    e.flying = true;
    if (back) e.vel.set(0, 2, 0);
    else { e.vel.copy(fwd).multiplyScalar(Math.max(0, finite(kart.speed)) + 26); e.vel.y = 13; }
  }

  _simBomb(e, dt) {
    if (e.flying) {
      e.vel.y -= PHYSICS.gravity * 0.8 * dt;
      e.pos.addScaledVector(e.vel, dt);
      const wall = this._wall(e.pos, e.radius);
      if (wall) {
        _v1.copy(wall.normal); _v1.y = 0; _v1.normalize();
        e.pos.addScaledVector(_v1, wall.depth);
        const vn = e.vel.dot(_v1);
        if (vn < 0) e.vel.addScaledVector(_v1, -1.5 * vn);
      }
      const g = this._groundHeight(e.pos, e);
      if (e.pos.y <= g && e.vel.y < 0) {
        if (e.pit) { this._kill(e, false); bus.emit('item:splash', { position: e.pos.clone() }); return; }
        e.pos.y = g; e.flying = false; e.vel.set(0, 0, 0);
      }
    }
    const left = BOMB_FUSE - e.age;
    const pulse = left < 1.2 ? 1 + Math.abs(Math.sin(e.age * (left < 0.5 ? 40 : 20))) * 0.25 : 1;
    e.holder.scale.setScalar(pulse);
    e.holder.rotation.y += dt * 3;
    e.holder.position.copy(e.pos);
    if (left <= 0) this._explodeBomb(e);
  }

  _explodeBomb(e) {
    if (e.dead) return;
    e.dead = true;
    const pos = e.pos.clone();
    bus.emit('item:explode', { position: pos, radius: BOMB_BLAST, kind: 'bomb' });
    for (const k of this.karts) {
      if (!k || !k.position) continue;
      const dx = k.position.x - pos.x, dz = k.position.z - pos.z, dy = k.position.y - pos.y;
      if (dx * dx + dz * dz < BOMB_BLAST * BOMB_BLAST && Math.abs(dy) < 5) this._hitKart(k, 'tumble', 'bomb', e.owner);
    }
    for (const o of this.entities) {
      if (o === e || o.dead || o.type === 'blue_shell') continue;
      if (o.pos.distanceToSquared(pos) < BOMB_BLAST * BOMB_BLAST) { o.dead = true; if (o.type === 'bomb') this._explodeBomb(o); }
    }
  }

  // ------------------------------------------------------------------ held items (drag / triple orbit)
  _heldSpec(kart) {
    if (!kart || kart.item == null || this.roulettes.has(kart) || kart.fallTimer > 0 || kart.rocketTimer > 0) return null;
    const s = this.kartState.get(kart);
    if (s && s.dragging) return { type: s.dragItem, count: 1, mode: 'drag' };
    if (kart.item === 'triple_green') return { type: 'green_shell', count: finite(kart.itemCount, 3), mode: 'orbit' };
    if (kart.item === 'triple_banana') return { type: 'banana', count: finite(kart.itemCount, 3), mode: 'trail' };
    return null;
  }

  _updateHeld(dt) {
    for (const kart of this.karts) {
      if (!kart) continue;
      const spec = this._heldSpec(kart);
      let hv = this.held.get(kart);
      if (!spec) { if (hv) { for (const h of hv.holders) this._release(h); this.held.delete(kart); } continue; }
      if (!hv || hv.type !== spec.type) {
        if (hv) for (const h of hv.holders) this._release(h);
        hv = { type: spec.type, holders: [], spin: 0 };
        this.held.set(kart, hv);
      }
      while (hv.holders.length > spec.count) this._release(hv.holders.pop());
      while (hv.holders.length < spec.count) hv.holders.push(this._acquire(spec.type));
      hv.spin += dt * 4.2;
      const fwd = kartForward(kart, _v1);
      const r = kartRadius(kart);
      for (let i = 0; i < hv.holders.length; i++) {
        const h = hv.holders[i];
        if (spec.mode === 'orbit') {
          const a = hv.spin + (i / Math.max(1, spec.count)) * Math.PI * 2;
          h.position.set(kart.position.x + Math.cos(a) * ORBIT_RADIUS, kart.position.y + 0.35, kart.position.z + Math.sin(a) * ORBIT_RADIUS);
          h.rotation.set(0, hv.spin * 3, 0);
        } else {
          const back = r + 0.9 + i * 1.25;
          h.position.copy(kart.position).addScaledVector(fwd, -back);
          h.position.y = kart.position.y + (spec.mode === 'drag' ? 0.05 : 0.02);
          h.rotation.set(0, kart.heading + Math.sin(this.time * 8 + i) * 0.2, 0);
        }
        h.visible = kart.ghostTimer > 0 ? Math.floor(this.time * 10) % 2 === 0 : true;
      }
      // orbiting shells clip other karts
      if (spec.mode === 'orbit') {
        for (let i = hv.holders.length - 1; i >= 0; i--) {
          const hp = hv.holders[i].position;
          for (const o of this.karts) {
            if (!o || o === kart || !o.position || o.ghostTimer > 0 || o.fallTimer > 0) continue;
            const rr = kartRadius(o) + 0.6;
            if (o.position.distanceToSquared(hp) < rr * rr && Math.abs(o.position.y - hp.y) < 1.8) {
              if (this._hitKart(o, 'tumble', 'green_shell', kart)) { this._consumeHeld(kart); bus.emit('item:explode', { position: hp.clone(), radius: 1.6, kind: 'small' }); }
              break;
            }
          }
        }
      }
    }
  }

  /** Remove one held item (drag or triple). */
  _consumeHeld(kart) {
    const s = this.kartState.get(kart);
    if (s && s.dragging) { s.dragging = false; s.dragItem = null; kart.item = null; kart.itemCount = 0; return; }
    const c = finite(kart.itemCount, 1) - 1;
    if (c > 0) kart.itemCount = c; else { kart.item = null; kart.itemCount = 0; }
  }

  /** Does kart k block entity e with a dragged/trailing/orbiting item? */
  _shieldBlocks(k, e) {
    const spec = this._heldSpec(k);
    if (!spec) return false;
    if (spec.mode === 'orbit') return true;
    const fwd = kartForward(k, _v3);
    return (e.pos.x - k.position.x) * fwd.x + (e.pos.z - k.position.z) * fwd.z < 0;
  }

  _lightning(by) {
    bus.emit('item:lightning', { by });
    for (const k of this.karts) {
      if (!k || k === by) continue;
      if (finite(k.starTimer) > 0 || finite(k.ghostTimer) > 0 || finite(k.rocketTimer) > 0) continue;
      k.applyHit?.('shrink');
      // lose held item (and roulette)
      if (k.item != null || this.roulettes.has(k)) {
        k.item = null; k.itemCount = 0; this.roulettes.delete(k);
      }
      bus.emit('item:hit', { kart: k, item: 'lightning', by });
    }
  }

  // ------------------------------------------------------------------ pools
  _acquire(type) {
    const list = this.pools.get(type);
    let h = list && list.length ? list.pop() : null;
    if (!h) h = buildItemVisual(type);
    h.visible = true;
    h.scale.setScalar(1);
    h.rotation.set(0, 0, 0);
    this.group.add(h);
    return h;
  }

  _release(holder) {
    if (!holder) return;
    this.group.remove(holder);
    const type = holder.userData.type;
    if (!this.pools.has(type)) this.pools.set(type, []);
    this.pools.get(type).push(holder);
  }

  _groundHeight(pos, e) {
    const tr = this.track;
    if (!tr?.getSurfaceInfo) return pos.y;
    try {
      const info = tr.getSurfaceInfo(pos, e ? e.t : undefined);
      if (info) {
        if (e) e.pit = !!info.pit;
        if (e && Number.isFinite(info.t)) e.t = info.t;
        if (Number.isFinite(info.height)) return info.height;
      }
    } catch (_) { /* ignore */ }
    return pos.y;
  }

  _makeEntity(type, owner, pos) {
    const e = {
      type, owner, dead: false, age: 0,
      pos: pos.clone(), vel: new THREE.Vector3(),
      t: finite(owner?.trackT, undefined),
      bounces: 0, life: 0, flying: false,
      holder: this._acquire(type),
      target: null, phase: 'travel', hoverTimer: 0, spin: Math.random() * 6,
      radius: type === 'banana' ? BANANA_RADIUS : SHELL_RADIUS,
    };
    e.hazard = { position: e.pos, radius: e.radius, type, velocity: e.vel, owner };
    e.holder.position.copy(e.pos);
    this.entities.push(e);
    this._enforceCaps(type);
    return e;
  }

  _enforceCaps(type) {
    const cap = type === 'banana' ? MAX_BANANAS : MAX_SHELLS;
    let count = 0;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.dead) continue;
      const isBanana = e.type === 'banana';
      if ((type === 'banana') !== isBanana) continue;
      count++;
      if (count > cap) this._kill(e, true);
    }
  }

  _spawnBanana(kart) {
    const fwd = kartForward(kart, _v1);
    const throwForward = !!kart.input?.throwForward;
    const r = kartRadius(kart);
    if (throwForward) {
      _v2.copy(kart.position).addScaledVector(fwd, r + 1.2);
      _v2.y += 1.2;
      const e = this._makeEntity('banana', kart, _v2);
      e.flying = true;
      e.vel.copy(fwd).multiplyScalar(Math.max(0, finite(kart.speed)) + 24);
      e.vel.y = 11;
    } else {
      _v2.copy(kart.position).addScaledVector(fwd, -(r + 1.1));
      const e = this._makeEntity('banana', kart, _v2);
      e.pos.y = this._groundHeight(e.pos, e);
      e.holder.rotation.y = Math.random() * Math.PI * 2;
    }
  }

  _spawnShell(kart, type) {
    const fwd = kartForward(kart, _v1);
    const back = !!kart.input?.lookBack;
    const dir = back ? -1 : 1;
    const r = kartRadius(kart);
    _v2.copy(kart.position).addScaledVector(fwd, dir * (r + SHELL_RADIUS + 0.6));
    const e = this._makeEntity(type, kart, _v2);
    e.pos.y = this._groundHeight(e.pos, e) + SHELL_HOVER;
    const base = Math.max(0, finite(kart.speed) * (back ? 0 : 1));
    const speed = (type === 'red_shell' ? RED_SPEED : GREEN_SPEED) + base * 0.35;
    e.vel.copy(fwd).multiplyScalar(dir * speed);
    e.speed = speed;
    if (type === 'red_shell') {
      e.target = back ? null : this._kartAhead(kart);
      e.homing = !back;
    }
  }

  _spawnBlue(kart) {
    _v2.copy(kart.position);
    _v2.y += 2.5;
    const e = this._makeEntity('blue_shell', kart, _v2);
    e.t = finite(kart.trackT, e.t);
    if (!Number.isFinite(e.t)) {
      try { e.t = this.track.getSurfaceInfo(kart.position)?.t ?? 0; } catch (_) { e.t = 0; }
    }
    e.phase = 'rise';
    e.alt = 2.5;
    e.target = this._leader();
  }

  _leader() {
    let best = null, bestScore = -Infinity;
    for (const k of this.karts) {
      if (!k) continue;
      let score;
      if (Number.isFinite(k.place)) score = -k.place * 1000;
      else if (Number.isFinite(k.raceProgress)) score = k.raceProgress;
      else score = finite(k.trackT);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  }

  _kartAhead(kart) {
    if (Number.isFinite(kart.place) && kart.place > 1) {
      for (const k of this.karts) if (k && k !== kart && k.place === kart.place - 1) return k;
    }
    if (Number.isFinite(kart.place) && kart.place === 1) return null;
    // fallback: nearest kart in front
    const fwd = kartForward(kart, _v3);
    let best = null, bestD = Infinity;
    for (const k of this.karts) {
      if (!k || k === kart || !k.position) continue;
      _v2.subVectors(k.position, kart.position);
      if (_v2.dot(fwd) <= 0) continue;
      const d = _v2.lengthSq();
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  // ------------------------------------------------------------------ simulation
  _updateEntities(dt) {
    const ents = this.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      e.age += dt;
      switch (e.type) {
        case 'banana': this._simBanana(e, dt); break;
        case 'green_shell': this._simShell(e, dt, false); break;
        case 'red_shell': this._simShell(e, dt, true); break;
        case 'blue_shell': this._simBlue(e, dt); break;
        case 'bomb': this._simBomb(e, dt); break;
        default: break;
      }
    }
    this._collide();
    // compact
    let w = 0;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) this._release(e.holder);
      else ents[w++] = e;
    }
    ents.length = w;
  }

  _simBanana(e, dt) {
    if (e.flying) {
      e.vel.y -= PHYSICS.gravity * 0.8 * dt;
      e.pos.addScaledVector(e.vel, dt);
      const wall = this._wall(e.pos, e.radius);
      if (wall) {
        _v1.copy(wall.normal); _v1.y = 0; _v1.normalize();
        e.pos.addScaledVector(_v1, wall.depth);
        const vn = e.vel.dot(_v1);
        if (vn < 0) e.vel.addScaledVector(_v1, -1.6 * vn);
      }
      const g = this._groundHeight(e.pos, e);
      if (e.pos.y <= g && e.vel.y < 0) {
        if (e.pit) { this._kill(e, false); bus.emit('item:splash', { position: e.pos.clone() }); return; }
        e.pos.y = g; e.flying = false; e.vel.set(0, 0, 0);
      }
      e.holder.rotation.x += dt * 9;
    } else {
      e.holder.rotation.x *= Math.max(0, 1 - dt * 12);
      // settle wobble right after dropping
      if (e.age < 0.6) e.holder.scale.setScalar(1 + Math.sin(e.age * 18) * 0.15 * (1 - e.age / 0.6));
      else e.holder.scale.setScalar(1);
    }
    e.holder.position.copy(e.pos);
  }

  _wall(pos, r) {
    const tr = this.track;
    if (!tr?.resolveWall) return null;
    try {
      const w = tr.resolveWall(pos, r);
      if (w && w.normal && Number.isFinite(w.depth)) return w;
    } catch (_) { /* ignore */ }
    return null;
  }

  _simShell(e, dt, isRed) {
    e.life += dt;
    const maxLife = isRed ? RED_LIFE : GREEN_LIFE;
    if (e.life > maxLife) { this._kill(e, true); return; }

    if (isRed && e.homing && e.age > 0.18) this._steerRed(e, dt);

    const steps = Math.max(1, Math.ceil((e.vel.length() * dt) / 1.2));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      e.pos.x += e.vel.x * sdt;
      e.pos.z += e.vel.z * sdt;
      const wall = this._wall(e.pos, e.radius);
      if (wall) {
        _v1.copy(wall.normal); _v1.y = 0;
        if (_v1.lengthSq() < 1e-6) continue;
        _v1.normalize();
        e.pos.addScaledVector(_v1, wall.depth + 0.02);
        const vn = e.vel.x * _v1.x + e.vel.z * _v1.z;
        if (vn < 0) {
          e.vel.x -= 2 * vn * _v1.x;
          e.vel.z -= 2 * vn * _v1.z;
          e.bounces++;
          if (!isRed && e.bounces > GREEN_BOUNCES) { this._kill(e, true); return; }
          if (isRed && !e.homing) { this._kill(e, true); return; }
        }
      }
    }
    const g = this._groundHeight(e.pos, e) + SHELL_HOVER;
    if (e.pit) { this._kill(e, false); bus.emit('item:splash', { position: e.pos.clone() }); return; }
    // follow the ground but allow short falls off ramps
    if (e.pos.y > g + 0.05) { e.vel.y -= PHYSICS.gravity * dt; e.pos.y += e.vel.y * dt; if (e.pos.y < g) { e.pos.y = g; e.vel.y = 0; } }
    else { e.pos.y = g; e.vel.y = 0; }
    e.spin += dt * 16;
    const h = e.holder;
    h.position.copy(e.pos);
    h.rotation.set(0, e.spin, 0);
  }

  _steerRed(e, dt) {
    const tr = this.track;
    let tgt = e.target;
    if (tgt && (tgt.finished && tgt.place == null)) tgt = null;
    const desired = _v1;
    let direct = false;
    if (tgt && tgt.position) {
      _v2.subVectors(tgt.position, e.pos); _v2.y = 0;
      const d = _v2.length();
      if (d < RED_DIRECT_DIST) { desired.copy(_v2); direct = true; }
    }
    if (!direct) {
      if (tr?.getPointAt && Number.isFinite(e.t) && Number.isFinite(tr.length) && tr.length > 0) {
        const la = 14 / tr.length;
        try {
          const p = tr.getPointAt(wrap01(e.t + la));
          if (p) desired.set(p.x - e.pos.x, 0, p.z - e.pos.z);
          else desired.copy(e.vel);
        } catch (_) { desired.copy(e.vel); }
      } else if (tgt && tgt.position) {
        desired.subVectors(tgt.position, e.pos); desired.y = 0;
      } else desired.copy(e.vel);
    }
    desired.y = 0;
    if (desired.lengthSq() < 1e-6) return;
    const cur = Math.atan2(e.vel.x, e.vel.z);
    const want = Math.atan2(desired.x, desired.z);
    let diff = want - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = (direct ? RED_TURN * 1.6 : RED_TURN) * dt;
    const na = cur + Math.max(-turn, Math.min(turn, diff));
    const sp = e.speed || RED_SPEED;
    e.vel.x = Math.sin(na) * sp;
    e.vel.z = Math.cos(na) * sp;
  }

  _simBlue(e, dt) {
    e.life += dt;
    const tr = this.track;
    // retarget current leader
    const leader = this._leader();
    if (leader) e.target = leader;
    const tgt = e.target;
    e.spin += dt * 10;
    if (e.life > BLUE_LIFE || !tgt || !tgt.position) { this._explodeBlue(e); return; }

    if (e.phase === 'rise') {
      e.alt = Math.min(BLUE_ALT, e.alt + dt * 12);
      if (e.alt >= BLUE_ALT - 0.01) e.phase = 'travel';
    }
    if (e.phase === 'rise' || e.phase === 'travel') {
      _v2.subVectors(tgt.position, e.pos); _v2.y = 0;
      const dist = _v2.length();
      if (dist < 22) { e.phase = 'seek'; }
      else if (tr?.getPointAt && Number.isFinite(tr.length) && tr.length > 0) {
        e.t = wrap01(finite(e.t) + (BLUE_SPEED * dt) / tr.length);
        let p = null;
        try { p = tr.getPointAt(e.t); } catch (_) { p = null; }
        if (p) {
          // blend toward centerline point (smooth)
          const k = Math.min(1, dt * 8);
          e.pos.x += (p.x - e.pos.x) * k;
          e.pos.z += (p.z - e.pos.z) * k;
          e.pos.y += (p.y + e.alt - e.pos.y) * k;
        }
      } else {
        _v2.normalize();
        e.pos.addScaledVector(_v2, BLUE_SPEED * dt);
      }
    }
    if (e.phase === 'seek') {
      _v2.subVectors(tgt.position, e.pos); _v2.y = 0;
      const dist = _v2.length();
      const step = Math.min(dist, (BLUE_SPEED * 0.9 + finite(tgt.speed) * 0.5) * dt);
      if (dist > 1e-3) e.pos.addScaledVector(_v2.normalize(), step);
      e.pos.y += (tgt.position.y + BLUE_ALT - e.pos.y) * Math.min(1, dt * 5);
      if (dist < 2.0) { e.phase = 'hover'; e.hoverTimer = 0; }
    }
    if (e.phase === 'hover') {
      e.hoverTimer += dt;
      const f = e.hoverTimer / BLUE_HOVER_TIME;
      const ang = e.hoverTimer * 9;
      const rad = 1.4 * (1 - f);
      e.pos.x = tgt.position.x + Math.cos(ang) * rad;
      e.pos.z = tgt.position.z + Math.sin(ang) * rad;
      const alt = BLUE_ALT * (1 - f) + 1.6 * f + Math.sin(e.hoverTimer * 20) * 0.1;
      e.pos.y = tgt.position.y + alt;
      e.spin += dt * 20 * f;
      if (f >= 1) { this._explodeBlue(e); return; }
    }
    const h = e.holder;
    h.position.copy(e.pos);
    h.rotation.set(Math.sin(e.life * 6) * 0.2, e.spin, Math.cos(e.life * 5) * 0.2);
  }

  _explodeBlue(e) {
    // on target after hovering; otherwise (timed out / lost target) explode where it is
    const pos = (e.phase === 'hover' && e.target?.position) ? _v3.copy(e.target.position) : _v3.copy(e.pos);
    if (e.phase !== 'hover') pos.y = this._groundHeight(pos, null);
    bus.emit('item:explode', { position: pos.clone(), radius: BLUE_RADIUS, kind: 'blue_shell' });
    for (const k of this.karts) {
      if (!k || !k.position) continue;
      const dx = k.position.x - pos.x, dz = k.position.z - pos.z, dy = k.position.y - pos.y;
      if (dx * dx + dz * dz < BLUE_RADIUS * BLUE_RADIUS && Math.abs(dy) < 6) this._hitKart(k, 'tumble', 'blue_shell', e.owner);
    }
    e.dead = true;
  }

  _hitKart(kart, kind, item, by) {
    if (finite(kart.starTimer) > 0 || finite(kart.invulnTimer) > 0 || finite(kart.ghostTimer) > 0 || finite(kart.rocketTimer) > 0) return false;
    if (kart.applyHit?.(kind) === false) return false;
    const st = this.kartState.get(kart); if (st) { st.dragging = false; st.dragItem = null; }
    bus.emit('item:hit', { kart, item, by });
    return true;
  }

  _kill(e, fx) {
    if (e.dead) return;
    e.dead = true;
    if (fx && e.type !== 'banana') bus.emit('item:explode', { position: e.pos.clone(), radius: 1.6, kind: 'small' });
  }

  _collide() {
    const ents = this.entities;
    const karts = this.karts;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead || e.type === 'blue_shell') continue;
      if (e.type === 'banana' && e.flying && e.vel.y > 0) continue;
      // vs karts
      for (const k of karts) {
        if (!k || !k.position) continue;
        if (k === e.owner && e.age < OWNER_GRACE) continue;
        if (finite(k.ghostTimer) > 0 || finite(k.fallTimer) > 0 || finite(k.respawnTimer) > 0) continue;
        const r = kartRadius(k) + e.radius;
        const dx = k.position.x - e.pos.x, dz = k.position.z - e.pos.z;
        const dy = (k.position.y + 0.4) - e.pos.y;
        if (dx * dx + dz * dz > r * r || Math.abs(dy) > 1.9) continue;
        if (e.type === 'bomb') {
          if (e.flying && e.age < 0.5) continue;
          this._explodeBomb(e);
          break;
        }
        if (this._shieldBlocks(k, e)) {
          this._consumeHeld(k);
          e.dead = true;
          bus.emit('item:explode', { position: e.pos.clone(), radius: 1.4, kind: 'small' });
          bus.emit('item:block', { kart: k, item: e.type });
          break;
        }
        if (finite(k.starTimer) > 0 || finite(k.rocketTimer) > 0) {
          // starred karts smash items
          e.dead = true;
          bus.emit('item:explode', { position: e.pos.clone(), radius: 1.4, kind: 'small' });
          break;
        }
        if (e.type === 'banana') {
          if (this._hitKart(k, 'spin', 'banana', e.owner) || finite(k.invulnTimer) <= 0) e.dead = true;
          else continue; // invulnerable karts pass over bananas
        } else {
          this._hitKart(k, 'tumble', e.type, e.owner);
          this._kill(e, true);
        }
        break;
      }
      if (e.dead) continue;
      // shells vs other items
      if (e.type === 'banana' || e.type === 'bomb') continue;
      for (let j = 0; j < ents.length; j++) {
        if (j === i) continue;
        const o = ents[j];
        if (o.dead || o.type === 'blue_shell') continue;
        if ((o.type === 'banana' || o.type === 'bomb') && o.flying) continue;
        if (e.age < 0.1 && o.owner === e.owner && o.type !== 'banana') continue;
        const r = e.radius + o.radius;
        const dx = o.pos.x - e.pos.x, dz = o.pos.z - e.pos.z, dy = o.pos.y - e.pos.y;
        if (dx * dx + dz * dz < r * r && Math.abs(dy) < 1.5) {
          this._kill(e, true);
          if (o.type === 'bomb') this._explodeBomb(o); else o.dead = true;
          break;
        }
      }
    }
  }
}
