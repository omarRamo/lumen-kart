// Track (Mondes). See ARCHITECTURE.md §1 + "Extensions" for the contract.
// createTrack(scene, renderer, { def, mirror, trackId, quality }) -> Track
//
// Data-driven generator: the course definition (tracks.js) gives control points and feature placements
// in "cpf" (fractional control-point index). Besides the original features (boost pads, ramps, gaps, item
// rows, coin/note lines, hazards, a lagoon `lake`), definitions may declare:
//   bridges:   [{ from, to }]  land viaducts / boardwalks (rails, deck, piers, no terrain under the road)
//   shortcuts: [{ from, to }]  the inner barrier of that bend opens onto offroad (a cut for boosting experts)
// Quality hint (mobile): opts.quality || renderer.userData.quality || globalThis.__lumenQuality ∈ high|medium|low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bus } from './events.js';
import * as TX from './track-textures.js';
import { createEnvironment } from './environment.js';

import { getTrackDef } from './tracks.js';

const N = 2000;                 // centerline samples
const HALF_W = 12;              // road half width (roadWidth = 24)
const GRID_CELL = 40;
const WATER_LEVEL = -1;
const OPEN_W = 58;              // barrier offset on the opened side of a shortcut

export const WORLD_ALIASES = { beach: 'lagoon', snow: 'aurora', lava: 'night' };
export const resolveWorld = (theme) => WORLD_ALIASES[theme] || theme || 'meadow';

// Per-world dressing of the track itself (environment.js does the rest).
const STYLE = {
  meadow: { boardwalk: true, bumper: [0xf2d37a, 0xfff4dc, 0xe7b860], wallTop: 0xfff7dc, pier: 0xa77e57, gantry: [0xfff7dc, 0xe98c73, 0x387d76], banner: ['#387d76', '#2b625d', '#fff7dc', '#edc371'], ramp: 0xedc371 },
  lagoon: { boardwalk: true, bumper: [0xff8a6a, 0xffffff, 0x3fc4c8], wallTop: 0xffffff, pier: 0xb08a5e, gantry: [0xffffff, 0x3fc4c8, 0x2f8fb0], banner: ['#2f9fc0', '#1f7a99', '#ffffff', '#ffd27a'], ramp: 0xffd27a },
  jungle: { boardwalk: true, bumper: [0x7a5030, 0x8a6038, 0x5f8f3a], wallTop: 0x6a9a48, pier: 0x6e4a2c, gantry: [0xc9a46a, 0x3f8a4a, 0x2a5a36], banner: ['#3f8a4a', '#2a6036', '#fff2c4', '#ffd25a'], ramp: 0xc9a46a },
  desert: { boardwalk: false, bumper: [0xd0704a, 0xfff0cf, 0xc99860], wallTop: 0xf3d6a4, pier: 0xd9a46c, gantry: [0xfff0cf, 0xd0704a, 0xb5683e], banner: ['#d0704a', '#a8502f', '#fff3d2', '#ffd27a'], ramp: 0xffd27a },
  medina: { boardwalk: false, bumper: [0x2a6fb0, 0xf8f6ef, 0xd66aa0], wallTop: 0x2a6fb0, pier: 0xf2eee4, gantry: [0xf8f6ef, 0x2a6fb0, 0x1d4f86], banner: ['#2a6fb0', '#1d4f86', '#ffffff', '#f3d096'], ramp: 0xf3d096 },
  city: { boardwalk: false, bumper: [0xffb84a, 0xf4f1ea, 0x5fd6e0], wallTop: 0xe9eaee, pier: 0x8f97a3, gantry: [0xf4f1ea, 0xffb84a, 0x3a3f4a], banner: ['#3a3f5a', '#272b40', '#fff0d2', '#ffb84a'], ramp: 0xffb84a },
  aurora: { boardwalk: false, bumper: [0x7fb8ff, 0xf4fbff, 0x9fe8d4], wallTop: 0xf6fbff, pier: 0xb7cde4, gantry: [0xf4fbff, 0x7fb8ff, 0x3f5f9a], banner: ['#3f5f9a', '#2a4374', '#f4fbff', '#9fe8d4'], ramp: 0x9fe8d4 },
  night: { boardwalk: false, bumper: [0xb7a6ff, 0xf3d096, 0x5b4fb0], wallTop: 0xcbbcff, pier: 0x4a4488, gantry: [0xdbd0ff, 0x5b4fb0, 0x2b2160], banner: ['#3a2f80', '#241c5a', '#fff7dc', '#f3d096'], ramp: 0xf3d096 },
};

// Robust merge: normalises index / attribute sets so mergeGeometries never fails; returns null if it still does.
export function safeMerge(parts, dispose = true) {
  const list0 = (parts || []).filter(Boolean);
  if (!list0.length) return null;
  const mixed = list0.some((p) => !p.index) && list0.some((p) => p.index);
  let list = mixed ? list0.map((p) => (p.index ? p.toNonIndexed() : p)) : list0;
  const common = Object.keys(list[0].attributes).filter((n) => list.every((p) => p.attributes[n]));
  for (const p of list) for (const n of Object.keys(p.attributes)) if (!common.includes(n)) p.deleteAttribute(n);
  for (const p of list) p.morphAttributes = {};
  let g = null;
  try { g = mergeGeometries(list); } catch (e) { g = null; }
  if (dispose) { list0.forEach((p) => p.dispose()); if (mixed) list.forEach((p) => p.dispose()); }
  return g || null;
}

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function smoothCircular(arr, radius, passes = 1) {
  let src = Float32Array.from(arr);
  const n = src.length;
  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(n);
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[(k + n) % n];
    const w = 2 * radius + 1;
    for (let i = 0; i < n; i++) {
      dst[i] = sum / w;
      sum += src[(i + radius + 1) % n] - src[(i - radius + n) % n];
    }
    src = dst;
  }
  return src;
}

export function readQuality(renderer, opts = {}) {
  const q = opts.quality || (renderer && renderer.userData && renderer.userData.quality) || globalThis.__lumenQuality || 'high';
  return q === 'low' || q === 'medium' ? q : 'high';
}

export function createTrack(scene, renderer, opts = {}) {
  const def = opts.def || getTrackDef(opts.trackId);
  const mirror = !!opts.mirror;
  const quality = readQuality(renderer, opts);
  const mx = mirror ? -1 : 1;
  const ml = mirror ? -1 : 1;          // mirrored lateral offsets
  const SCALE = def.scale || 1.15;
  const CP = def.cp.map(([x, y, z]) => [x * mx, y, z]);
  const LAKE = def.lake ? { x: def.lake.x * mx, z: def.lake.z, r: def.lake.r } : { x: 1e6, z: 1e6, r: 1 };
  const OPEN_BRIDGE = !!(def.lake && def.lake.open);
  const world = resolveWorld(def.theme);
  const style = STYLE[world] || STYLE.meadow;
  const pitKind = world === 'night' ? 'void' : 'water';
  const root = new THREE.Group();
  root.name = 'track';
  scene.add(root);
  const disposables = [];
  const track = {};

  // ------------------------------------------------------------------ centerline
  const pts = CP.map(([x, y, z]) => new THREE.Vector3(x * SCALE, y, z * SCALE));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  curve.arcLengthDivisions = 6000;
  curve.updateArcLengths();
  const length = curve.getLength();
  const ds = length / N;

  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const tx = new Float32Array(N), ty = new Float32Array(N), tz = new Float32Array(N);
  const rx = new Float32Array(N), rz = new Float32Array(N);
  const head = new Float32Array(N);
  const _p = new THREE.Vector3(), _t = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const u = i / N;
    curve.getPointAt(u, _p);
    curve.getTangentAt(u, _t).normalize();
    px[i] = _p.x; py[i] = _p.y; pz[i] = _p.z;
    tx[i] = _t.x; ty[i] = _t.y; tz[i] = _t.z;
    const hl = Math.hypot(_t.x, _t.z) || 1;
    rx[i] = -_t.z / hl; rz[i] = _t.x / hl;   // right = tangent × up
    head[i] = Math.atan2(_t.x, _t.z);
  }

  // signed curvature (dh/ds; + = turning left)
  const kRaw = new Float32Array(N);
  for (let i = 0; i < N; i++) kRaw[i] = wrapAngle(head[(i + 1) % N] - head[(i - 1 + N) % N]) / (2 * ds);
  const kS = smoothCircular(kRaw, 6, 2);
  const kWide = smoothCircular(kRaw, 22, 3);

  // ------------------------------------------------------------------ spatial grid (needed by feature placement)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }
  const gx0 = minX - 200, gz0 = minZ - 200;
  const gw = Math.ceil((maxX - minX + 400) / GRID_CELL), gh = Math.ceil((maxZ - minZ + 400) / GRID_CELL);
  const grid = Array.from({ length: gw * gh }, () => []);
  for (let i = 0; i < N; i++) {
    const cx = Math.floor((px[i] - gx0) / GRID_CELL), cz = Math.floor((pz[i] - gz0) / GRID_CELL);
    grid[cz * gw + cx].push(i);
  }

  // nearest centerline sample (horizontal). Returns index, stores squared dist in _nd2.
  let _nd2 = 0;
  function nearestGrid(x, z, noFallback = false) {
    const cx = Math.floor((x - gx0) / GRID_CELL), cz = Math.floor((z - gz0) / GRID_CELL);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 2; r++) {
      for (let j = cz - r; j <= cz + r; j++) {
        if (j < 0 || j >= gh) continue;
        for (let k = cx - r; k <= cx + r; k++) {
          if (k < 0 || k >= gw) continue;
          if (r === 2 && j > cz - 2 && j < cz + 2 && k > cx - 2 && k < cx + 2) continue;
          const cell = grid[j * gw + k];
          for (let m = 0; m < cell.length; m++) {
            const i = cell[m];
            const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
            if (d < bd) { bd = d; best = i; }
          }
        }
      }
      if (best >= 0 && bd <= (GRID_CELL * r) * (GRID_CELL * r)) { _nd2 = bd; return best; }
    }
    if (noFallback) { _nd2 = Infinity; return -1; }
    for (let i = 0; i < N; i++) {
      const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    _nd2 = bd;
    return best;
  }

  const nearestToCP = (cpf) => {
    const i0 = Math.floor(cpf) % CP.length, i1 = (i0 + 1) % CP.length, f = cpf - Math.floor(cpf);
    const x = (CP[i0][0] + (CP[i1][0] - CP[i0][0]) * f) * SCALE;
    const z = (CP[i0][2] + (CP[i1][2] - CP[i0][2]) * f) * SCALE;
    return nearestGrid(x, z);
  };
  // sample range [a, b] (b may be < a: wraps) of a cpf range
  const cpfRange = (r) => {
    const a = nearestToCP(r.from), b = nearestToCP(r.to);
    return [a, b >= a ? b : b + N];
  };

  // ------------------------------------------------------------------ clearance to other road sections
  // clear[i] = horizontal distance from sample i to the closest sample that is > 90 m away along the road.
  const clear = new Float32Array(N).fill(400);
  {
    const sep = Math.round(90 / ds);
    for (let i = 0; i < N; i += 2) {
      const cx = Math.floor((px[i] - gx0) / GRID_CELL), cz = Math.floor((pz[i] - gz0) / GRID_CELL);
      let bd = Infinity;
      for (let j = cz - 3; j <= cz + 3; j++) {
        if (j < 0 || j >= gh) continue;
        for (let k = cx - 3; k <= cx + 3; k++) {
          if (k < 0 || k >= gw) continue;
          for (const m of grid[j * gw + k]) {
            let d = Math.abs(m - i); d = Math.min(d, N - d);
            if (d < sep) continue;
            const dx = px[m] - px[i], dz = pz[m] - pz[i], dd = dx * dx + dz * dz;
            if (dd < bd) bd = dd;
          }
        }
      }
      clear[i] = Math.min(400, Math.sqrt(bd));
      if (i + 1 < N) clear[i + 1] = clear[i];
    }
  }

  // bridge factor: over the lake + declared viaduct ranges
  let bridge = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(px[i] - LAKE.x, pz[i] - LAKE.z);
    bridge[i] = 1 - smoothstep(LAKE.r - 5, LAKE.r + 28, d);
  }
  for (const br of def.bridges || []) {
    const [a, b] = cpfRange(br);
    for (let ii = a; ii <= b; ii++) bridge[ii % N] = 1;
  }
  bridge = smoothCircular(bridge, 8, 1);

  // wall offsets (distance from centerline to barrier inner face)
  const wallBase = (side) => {
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const outer = side > 0 ? Math.max(0, kS[i]) : Math.max(0, -kS[i]);
      w[i] = HALF_W + 7 + Math.min(6, outer * 700);
    }
    return w;
  };
  const innerClamp = (w, side) => {
    for (let i = 0; i < N; i++) {
      const inner = side > 0 ? Math.max(0, -kS[i]) : Math.max(0, kS[i]);
      if (inner > 1e-4) w[i] = Math.min(w[i], 1 / inner - 5);
      w[i] = Math.min(w[i], clear[i] / 2 - 1);
      w[i] = Math.max(HALF_W + 1.5, w[i]);
      w[i] = w[i] * (1 - bridge[i]) + (HALF_W + 1.2) * bridge[i];
    }
    return w;
  };
  const wallR = innerClamp(smoothCircular(innerClamp(wallBase(1), 1), 18, 2), 1);
  const wallL = innerClamp(smoothCircular(innerClamp(wallBase(-1), -1), 18, 2), -1);

  // shortcuts: open the inner barrier through a bend (with a funnel ramp at both ends)
  const openR = new Uint8Array(N), openL = new Uint8Array(N);
  const shortcutZones = [];
  for (const sc of def.shortcuts || []) {
    const [a, b] = cpfRange(sc);
    let ksum = 0;
    for (let ii = a; ii <= b; ii++) ksum += kWide[ii % N];
    const side = ksum > 0 ? -1 : 1;           // turning left -> inner side is the left (-1)
    const W = side > 0 ? wallR : wallL, open = side > 0 ? openR : openL;
    const ramp = Math.max(6, Math.round(26 / ds));
    for (let ii = a - ramp; ii <= b + ramp; ii++) {
      const i = ((ii % N) + N) % N;
      const f = ii < a ? (ii - (a - ramp)) / ramp : ii > b ? ((b + ramp) - ii) / ramp : 1;
      const target = W[i] + (OPEN_W - W[i]) * smoothstep(0, 1, f);
      if (target > W[i]) W[i] = target;
      if (W[i] > HALF_W + 9) open[i] = 1;
    }
    shortcutZones.push({ s0: a, s1: b, side });
  }
  let maxWall = 0;
  for (let i = 0; i < N; i++) maxWall = Math.max(maxWall, wallR[i], wallL[i]);

  // racing line lateral offsets
  const maxOff = HALF_W - 3;
  const apex = new Float32Array(N);
  for (let i = 0; i < N; i++) apex[i] = -clamp(kWide[i] * 160, -1, 1) * maxOff;
  const lookA = Math.round(32 / ds);
  let race = new Float32Array(N);
  for (let i = 0; i < N; i++) race[i] = clamp(apex[i] - 0.55 * apex[(i + lookA) % N], -maxOff, maxOff);
  race = smoothCircular(race, 14, 2);

  const WIN = 45;
  function nearest(x, z, hintT) {
    if (typeof hintT === 'number' && isFinite(hintT)) {
      const c = Math.round((((hintT % 1) + 1) % 1) * N);
      let best = -1, bd = Infinity, bk = 0;
      for (let k = -WIN; k <= WIN; k++) {
        const i = (c + k + N) % N;
        const dx = px[i] - x, dz = pz[i] - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; bk = k; }
      }
      const lim = maxWall + 8;
      if (bd < lim * lim && Math.abs(bk) < WIN) {
        // off the road (e.g. crossing a shortcut): another section may be closer
        if (bd > (HALF_W + 2) * (HALF_W + 2)) {
          const g = nearestGrid(x, z);
          if (_nd2 < bd) return g;
        }
        _nd2 = bd; return best;
      }
    }
    return nearestGrid(x, z);
  }

  // Projects (x,z) onto the centerline. Fills `proj`.
  const proj = { a: 0, b: 1, f: 0, s: 0, lat: 0, y: 0, cx: 0, cz: 0, rx: 0, rz: 0 };
  function project(x, z, hintT) {
    const i = nearest(x, z, hintT);
    const n = (i + 1) % N, p = (i - 1 + N) % N;
    const along = (x - px[i]) * tx[i] + (z - pz[i]) * tz[i];
    const a = along >= 0 ? i : p, b = along >= 0 ? n : i;
    const sx = px[b] - px[a], sz = pz[b] - pz[a];
    const L2 = sx * sx + sz * sz || 1;
    const f = clamp(((x - px[a]) * sx + (z - pz[a]) * sz) / L2, 0, 1);
    const cx = px[a] + sx * f, cz = pz[a] + sz * f;
    let rxi = rx[a] + (rx[b] - rx[a]) * f, rzi = rz[a] + (rz[b] - rz[a]) * f;
    const rl = Math.hypot(rxi, rzi) || 1; rxi /= rl; rzi /= rl;
    proj.a = a; proj.b = b; proj.f = f;
    proj.s = a + f;                              // in samples
    proj.cx = cx; proj.cz = cz;
    proj.y = py[a] + (py[b] - py[a]) * f;
    proj.rx = rxi; proj.rz = rzi;
    proj.lat = (x - cx) * rxi + (z - cz) * rzi;
    return proj;
  }

  const lerpArr = (arr, a, b, f) => arr[a] + (arr[b] - arr[a]) * f;
  const idxAtDist = (d) => ((((d / ds) % N) + N) % N);

  // ------------------------------------------------------------------ features
  // Boost pads: s0/len in samples, lateral centre, half width
  const PAD_LEN = Math.max(3, Math.round(7 / ds));
  const boostPads = [];
  const addPad = (sIdx, lat) => boostPads.push({ s0: ((sIdx % N) + N) % N, len: PAD_LEN, lat, hw: 2.6 });
  const padStep = Math.round(16 / ds);
  for (const pd of def.pads || []) {
    const i = nearestToCP(pd.at);
    if (pd.line) { for (let k = 0; k < pd.line; k++) addPad(i + padStep * k, race[(i + padStep * k) % N]); continue; }
    (pd.lats || [0]).forEach((lat, k) => addPad(i + (pd.stagger ? padStep * k : 0), lat * ml));
  }

  // Jump ramps (optionally followed by a gap in the road that must be jumped)
  const RAMP_LEN = Math.max(4, Math.round(9 / ds));
  const ramps = [];
  const gaps = [];
  for (const rd of def.ramps || []) {
    const s0 = ((nearestToCP(rd.at) % N) + N) % N;
    ramps.push({ s0, len: RAMP_LEN, hw: rd.hw || 10, h: rd.h || 1.7 });
    if (rd.gap) gaps.push({ s0: (s0 + RAMP_LEN + 1) % N, len: Math.max(2, Math.round(rd.gap / ds)), rampS0: s0 });
  }
  const gapMask = new Uint8Array(N);
  for (const g of gaps) for (let k = 0; k < g.len; k++) gapMask[(g.s0 + k) % N] = 1;

  // Item box rows
  const itemBoxPositions = [];
  const itemRowIdx = (def.itemRows || []).map(nearestToCP);
  for (const i of itemRowIdx) {
    for (const lat of [-8, -4, 0, 4, 8]) {
      itemBoxPositions.push(new THREE.Vector3(px[i] + rx[i] * lat, py[i] + 1.4, pz[i] + rz[i] * lat));
    }
  }

  // Coin (note) lines along the road
  const coinPositions = [];
  const coinStep = Math.max(1, Math.round(4 / ds));
  for (const cl of def.coins || []) {
    const i0 = nearestToCP(cl.at);
    for (let k = 0; k < (cl.n || 5); k++) {
      const i = (i0 + k * coinStep) % N;
      if (gapMask[i]) continue;
      const lat = (cl.lat || 0) * ml;
      coinPositions.push(new THREE.Vector3(px[i] + rx[i] * lat, py[i] + 1.0, pz[i] + rz[i] * lat));
    }
  }

  // Track hazards (resolved to track parameter + lateral offset; hazards.js animates them)
  const hazardDefs = (def.hazards || []).map((h) => {
    const i = nearestToCP(h.at);
    return { ...h, t: i / N, lat: (h.lat || 0) * ml, world };
  });

  // ------------------------------------------------------------------ public API
  const wrapDelta = (s, s0) => { let d = s - s0; if (d < 0) d += N; return d; };
  const UP = new THREE.Vector3(0, 1, 0);

  function getSurfaceInfo(pos, hintT) {
    if (!pos || !isFinite(pos.x) || !isFinite(pos.z)) {
      return { height: 0, normal: UP.clone(), surface: 'road', t: 0, lateral: 0, onRoad: true };
    }
    const pr = project(pos.x, pos.z, hintT);
    const { a, b, f } = pr;
    const lat = pr.lat;
    const t = (pr.s / N) % 1;
    let height = pr.y;
    // slope normal = right × tangent
    const Tx = lerpArr(tx, a, b, f), Ty = lerpArr(ty, a, b, f), Tz = lerpArr(tz, a, b, f);
    const normal = new THREE.Vector3(-pr.rz * Ty, pr.rz * Tx - pr.rx * Tz, pr.rx * Ty).normalize();
    const onRoad = Math.abs(lat) <= HALF_W;
    let surface = onRoad ? 'road' : 'offroad';
    const roadY = height;
    const ia = gapMask[a] ? a : b;
    if (gapMask[ia] || (OPEN_BRIDGE && bridge[a] >= 0.5 && Math.abs(lat) > (lat > 0 ? wallR[a] : wallL[a]) + 0.8)) {
      return { height: WATER_LEVEL - 3, roadY, normal, surface: 'pit', t, lateral: lat, onRoad: false, pit: true };
    }
    if (onRoad) {
      for (let k = 0; k < ramps.length; k++) {
        const r = ramps[k];
        const d = wrapDelta(pr.s, r.s0);
        if (d <= r.len && Math.abs(lat) <= r.hw) {
          const slope = r.h / (r.len * ds);
          height += slope * d * ds;
          surface = 'jump';
          normal.set(normal.x - Tx * slope, normal.y - Ty * slope, normal.z - Tz * slope).normalize();
          break;
        }
      }
      if (surface === 'road') {
        for (let k = 0; k < boostPads.length; k++) {
          const p = boostPads[k];
          if (wrapDelta(pr.s, p.s0) <= p.len && Math.abs(lat - p.lat) <= p.hw) { surface = 'boost'; break; }
        }
      }
    }
    return { height, roadY, normal, surface, t, lateral: lat, onRoad };
  }

  function resolveWall(pos, radius = 1.3) {
    if (!pos || !isFinite(pos.x) || !isFinite(pos.z)) return null;
    const pr = project(pos.x, pos.z);
    if (OPEN_BRIDGE && bridge[pr.a] >= 0.5) return null;
    const wr = lerpArr(wallR, pr.a, pr.b, pr.f), wl = lerpArr(wallL, pr.a, pr.b, pr.f);
    if (pr.lat + radius > wr) {
      return { normal: new THREE.Vector3(-pr.rx, 0, -pr.rz), depth: pr.lat + radius - wr };
    }
    if (-pr.lat + radius > wl) {
      return { normal: new THREE.Vector3(pr.rx, 0, pr.rz), depth: -pr.lat + radius - wl };
    }
    return null;
  }

  const getPointAt = (t) => curve.getPointAt((((t % 1) + 1) % 1));
  const getTangentAt = (t) => curve.getTangentAt((((t % 1) + 1) % 1)).normalize();
  function getRacingLine(t) {
    const s = (((t % 1) + 1) % 1) * N;
    const a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
    const off = race[a] + (race[b] - race[a]) * f;
    const x = lerpArr(px, a, b, f), y = lerpArr(py, a, b, f), z = lerpArr(pz, a, b, f);
    let rxi = lerpArr(rx, a, b, f), rzi = lerpArr(rz, a, b, f);
    const rl = Math.hypot(rxi, rzi) || 1; rxi /= rl; rzi /= rl;
    return new THREE.Vector3(x + rxi * off, y, z + rzi * off);
  }

  // Start grid: staggered 2-wide, pole (index 0) nearest the line.
  const startPositions = [];
  for (let k = 0; k < 8; k++) {
    const back = 8 + k * 5.2;
    const s = idxAtDist(length - back);
    const a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
    const lat = k % 2 === 0 ? -4.5 : 4.5;
    const x = lerpArr(px, a, b, f) + lerpArr(rx, a, b, f) * lat;
    const z = lerpArr(pz, a, b, f) + lerpArr(rz, a, b, f) * lat;
    startPositions.push({
      position: new THREE.Vector3(x, lerpArr(py, a, b, f), z),
      heading: Math.atan2(lerpArr(tx, a, b, f), lerpArr(tz, a, b, f)),
    });
  }

  const minimap = { points: [], bounds: { minX, maxX, minZ, maxZ } };
  for (let i = 0; i < 256; i++) {
    const j = Math.floor(i * N / 256);
    minimap.points.push({ x: px[j], z: pz[j] });
  }

  // ------------------------------------------------------------------ geometry helpers
  // Extrude a cross-section polyline along samples [i0, i1] (i1 may exceed N; wraps).
  function extrude(i0, i1, profile, { across = null, acrossScale = 1, alongScale = 1, alongSign = 1, swap = false, step = 1 } = {}) {
    const rings = [];
    for (let i = i0; i < i1; i += step) rings.push(i);
    rings.push(i1);
    const m = profile(((Math.round(i0) % N) + N) % N, i0).length;
    const pos = new Float32Array(rings.length * m * 3);
    const uv = new Float32Array(rings.length * m * 2);
    let p = 0, q = 0;
    for (const ii of rings) {
      const i = ((Math.round(ii) % N) + N) % N;
      const prof = profile(i, ii);
      const along = (ii - i0) * ds / alongScale * alongSign;
      for (let j = 0; j < m; j++) {
        const [lat, dy] = prof[j];
        pos[p++] = px[i] + rx[i] * lat;
        pos[p++] = py[i] + dy;
        pos[p++] = pz[i] + rz[i] * lat;
        const ac = across ? across[j] : lat / acrossScale;
        if (swap) { uv[q++] = along; uv[q++] = ac; } else { uv[q++] = ac; uv[q++] = along; }
      }
    }
    const idx = [];
    for (let r = 0; r < rings.length - 1; r++) {
      for (let j = 0; j < m - 1; j++) {
        const A = r * m + j, B = r * m + j + 1, C = (r + 1) * m + j, D = (r + 1) * m + j + 1;
        idx.push(A, B, C, B, D, C);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Runs of samples where predicate(i) is true, as [start, end] (end may exceed N for wrap).
  function runs(pred, minLen = 1) {
    const out = [];
    const flags = new Uint8Array(N);
    for (let i = 0; i < N; i++) flags[i] = pred(i) ? 1 : 0;
    if (flags.every((v) => v)) return [[0, N]];
    let start = 0;
    while (flags[start]) start++;   // start at a false sample so runs don't split at the seam
    let runStart = -1;
    for (let k = 1; k <= N; k++) {
      const i = start + k;
      const v = flags[i % N];
      if (v && runStart < 0) runStart = i;
      if (!v && runStart >= 0) { if (i - runStart >= minLen) out.push([runStart - 1, i]); runStart = -1; }
    }
    return out;
  }

  const addMesh = (geo, material, { cast = false, receive = true, name = '' } = {}) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.name = name;
    root.add(mesh);
    disposables.push(geo);
    return mesh;
  };
  const addMerged = (geos, material, opts2) => {
    if (!geos.length) return null;
    const g = geos.length === 1 ? geos[0] : safeMerge(geos);
    return g ? addMesh(g, material, opts2) : null;
  };
  const mat = (m) => { disposables.push(m); if (m.map) disposables.push(m.map); if (m.emissiveMap && m.emissiveMap !== m.map) disposables.push(m.emissiveMap); return m; };

  // ------------------------------------------------------------------ road surface
  const roadMat = mat(new THREE.MeshStandardMaterial({ map: TX.makeRoadTexture(world), roughness: 0.88, metalness: 0.0 }));
  const deckRoadMat = style.boardwalk ? mat(new THREE.MeshStandardMaterial({ map: TX.makeBoardwalkTexture(world), roughness: 0.8 })) : roadMat;
  {
    const roadGeos = [], deckGeos2 = [];
    for (const [a, b] of runs((i) => !gapMask[i], 2)) {
      if (deckRoadMat === roadMat) { roadGeos.push(extrude(a, b, () => [[-HALF_W, 0], [0, 0], [HALF_W, 0]], { across: [0, 0.5, 1], alongScale: 22 })); continue; }
      // split into land road / boardwalk sub-runs
      let s = a, onDeck = bridge[a % N] >= 0.5;
      for (let ii = a + 1; ii <= b; ii++) {
        const d = bridge[ii % N] >= 0.5;
        if (d !== onDeck || ii === b) {
          const g = extrude(s, ii, () => [[-HALF_W, 0], [0, 0], [HALF_W, 0]], { across: [0, 0.5, 1], alongScale: onDeck ? 12 : 22 });
          (onDeck ? deckGeos2 : roadGeos).push(g);
          s = ii; onDeck = d;
        }
      }
    }
    addMerged(roadGeos, roadMat, { name: 'road' });
    addMerged(deckGeos2, deckRoadMat, { name: 'boardwalk' });
  }

  // Curbs through corners (raised two-colour rumble strips)
  const curbMat = mat(new THREE.MeshStandardMaterial({ map: TX.makeCurbTexture(world), roughness: 0.6 }));
  const curbMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (Math.abs(kS[i]) > 1 / 240 && bridge[i] < 0.2) {
    for (let k = -30; k <= 30; k++) curbMask[(i + k + N) % N] = 1;
  }
  for (let i = 0; i < N; i++) if (bridge[i] > 0.05 || gapMask[i]) curbMask[i] = 0;
  const curbGeos = [];
  for (const [a, b] of runs((i) => curbMask[i], 10)) {
    curbGeos.push(extrude(a, b, () => [[HALF_W - 1.4, 0.0], [HALF_W - 1.1, 0.08], [HALF_W + 0.7, 0.08], [HALF_W + 0.9, -0.05]], { across: [0, 0.15, 0.9, 1], alongScale: 4 }));
    curbGeos.push(extrude(a, b, () => [[-HALF_W - 0.9, -0.05], [-HALF_W - 0.7, 0.08], [-HALF_W + 1.1, 0.08], [-HALF_W + 1.4, 0.0]], { across: [0, 0.1, 0.85, 1], alongScale: 4 }));
  }
  addMerged(curbGeos, curbMat, { name: 'curbs' });

  // Offroad bands + bridge deck edges. Bands stop before they would fold over (tight inner side / shortcuts).
  const grassMat = mat(new THREE.MeshStandardMaterial({ map: TX.makeOffroadTexture(world), roughness: 1 }));
  const deckMat = mat(new THREE.MeshStandardMaterial({ map: style.boardwalk ? TX.makeBoardwalkTexture(world) : TX.makeConcreteTexture(world), roughness: 0.9 }));
  const bandOuter = (i, side) => {
    const W = side > 0 ? wallR[i] : wallL[i];
    const inner = side > 0 ? Math.max(0, -kS[i]) : Math.max(0, kS[i]);
    let o = W + 0.35;
    if (inner > 1e-4) o = Math.min(o, 1 / inner - 1.5);
    o = Math.min(o, clear[i] / 2 - 0.5);
    return Math.max(HALF_W + 0.5, o);
  };
  const bandGeos = [], deckGeos = [];
  for (const [a, b] of runs((i) => bridge[i] < 0.5, 5)) {
    bandGeos.push(extrude(a, b, (i) => [[HALF_W - 0.2, -0.03], [bandOuter(i, 1), -0.03]], { acrossScale: 6, alongScale: 6 }));
    bandGeos.push(extrude(a, b, (i) => [[-bandOuter(i, -1), -0.03], [-HALF_W + 0.2, -0.03]], { acrossScale: 6, alongScale: 6 }));
  }
  const bridgeRuns = runs((i) => bridge[i] >= 0.5, 5);
  for (const [c0, c1] of runs((i) => bridge[i] >= 0.5 && !gapMask[i], 2)) {
    deckGeos.push(extrude(c0, c1, (i) => [[HALF_W - 0.2, -0.02], [wallR[i] + 0.8, -0.02]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(c0, c1, (i) => [[-wallL[i] - 0.8, -0.02], [-HALF_W + 0.2, -0.02]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(c0, c1, (i) => [[wallR[i] + 0.8, -0.02], [wallR[i] + 0.8, -2.4]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(c0, c1, (i) => [[-wallL[i] - 0.8, -2.4], [-wallL[i] - 0.8, -0.02]], { acrossScale: 4, alongScale: 4 }));
    deckGeos.push(extrude(c0, c1, (i) => [[wallR[i] + 0.8, -2.4], [-wallL[i] - 0.8, -2.4]], { acrossScale: 4, alongScale: 4 }));
  }
  addMerged(bandGeos, grassMat, { name: 'offroad' });
  addMerged(deckGeos, deckMat, { name: 'deck', cast: true });

  // ------------------------------------------------------------------ barriers
  // type per side: 'rail' (bridge), 'tires' (bumpers outside tight corners), 'wall', 'none' (open)
  const barrierType = (side) => {
    const typ = new Array(N);
    const tight = new Uint8Array(N);
    const open = side > 0 ? openR : openL;
    for (let i = 0; i < N; i++) {
      const outer = side > 0 ? kS[i] > 1 / 55 : kS[i] < -1 / 55;
      if (outer) for (let k = -18; k <= 18; k++) tight[(i + k + N) % N] = 1;
    }
    for (let i = 0; i < N; i++) {
      typ[i] = open[i] ? 'none' : bridge[i] >= 0.5 ? (OPEN_BRIDGE ? 'none' : (gapMask[i] ? 'none' : 'rail')) : tight[i] ? 'tires' : 'wall';
    }
    return typ;
  };
  const typeR = barrierType(1), typeL = barrierType(-1);

  const wallMat = mat(new THREE.MeshStandardMaterial({ map: TX.makeBarrierTexture(world), roughness: 0.6 }));
  const wallTopMat = mat(new THREE.MeshStandardMaterial({ color: style.wallTop, roughness: 0.55 }));
  const railMat = mat(new THREE.MeshStandardMaterial({ map: TX.makeRailTexture(world), roughness: 0.5 }));
  const WALL_H = 1.25, WALL_T = 0.7, TEX_LEN = 9.6;
  const vMap = (y) => (y + 1.5) / (WALL_H + 1.5);
  const wallFaces = [], wallTops = [], railFaces = [];
  for (const side of [1, -1]) {
    const typ = side > 0 ? typeR : typeL;
    const W = side > 0 ? wallR : wallL;
    for (const kind of ['wall', 'rail']) {
      const faces = kind === 'wall' ? wallFaces : railFaces;
      const bottom = kind === 'rail' ? -2.4 : -1.5;
      const h = kind === 'rail' ? 1.1 : WALL_H;
      const vm = kind === 'rail' ? ((y) => (y + 0.02) / (h + 0.02)) : vMap;
      for (const [a, b] of runs((i) => typ[i] === kind, 4)) {
        if (side > 0) {
          faces.push(extrude(a, b, (i) => [[W[i], bottom], [W[i], h]], { across: [vm(bottom), vm(h)], alongScale: TEX_LEN, alongSign: -1, swap: true }));
          wallTops.push(extrude(a, b, (i) => [[W[i], h], [W[i] + WALL_T, h]], { across: [0, 1], alongScale: TEX_LEN }));
          faces.push(extrude(a, b, (i) => [[W[i] + WALL_T, h], [W[i] + WALL_T, bottom]], { across: [vm(h), vm(bottom)], alongScale: TEX_LEN, swap: true }));
        } else {
          faces.push(extrude(a, b, (i) => [[-W[i] - WALL_T, bottom], [-W[i] - WALL_T, h]], { across: [vm(bottom), vm(h)], alongScale: TEX_LEN, alongSign: -1, swap: true }));
          wallTops.push(extrude(a, b, (i) => [[-W[i] - WALL_T, h], [-W[i], h]], { across: [0, 1], alongScale: TEX_LEN }));
          faces.push(extrude(a, b, (i) => [[-W[i], h], [-W[i], bottom]], { across: [vm(h), vm(bottom)], alongScale: TEX_LEN, swap: true }));
        }
      }
    }
  }
  // the barrier texture is 1024 px for 9.6 m: show its visible top band only
  wallMat.map.repeat.set(1, 1);
  addMerged(wallFaces, wallMat, { cast: true, name: 'walls' });
  if (railFaces.length) railMat.map.repeat.set(1 / 2.5, 1);
  addMerged(railFaces, railMat, { cast: true, name: 'rails' });
  addMerged(wallTops, wallTopMat, { cast: false, name: 'wallTops' });

  // Bumper stacks (instanced, themed: hay bales, buoys, logs, pots…) — inner face on the collision line.
  {
    const TR = 0.9;
    const tireGeo = new THREE.CylinderGeometry(TR, TR, 0.42, 12, 1);
    const tireMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.75 }));
    const places = [];
    for (const side of [1, -1]) {
      const typ = side > 0 ? typeR : typeL;
      const W = side > 0 ? wallR : wallL;
      for (const [a, b] of runs((i) => typ[i] === 'tires', 4)) {
        let acc = 1e9, lx = 0, lz = 0, stack = 0;
        for (let ii = a; ii <= b; ii++) {
          const i = ii % N;
          const lat = side * (W[i] + TR);
          const x = px[i] + rx[i] * lat, z = pz[i] + rz[i] * lat;
          acc += Math.hypot(x - lx, z - lz); lx = x; lz = z;
          if (acc >= TR * 1.95) { acc = 0; places.push({ x, y: py[i], z, stack: stack++ }); }
        }
      }
    }
    const [c0, c1, c2] = style.bumper.map((h) => new THREE.Color(h));
    const im = new THREE.InstancedMesh(tireGeo, tireMat, Math.max(1, places.length * 3));
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (const p of places) {
      for (let l = 0; l < 3; l++) {
        m4.makeRotationY(p.stack * 0.7 + l);
        m4.setPosition(p.x, p.y + 0.21 + l * 0.44, p.z);
        im.setMatrixAt(n, m4);
        im.setColorAt(n, l === 1 ? (p.stack % 2 ? c2 : c0) : c1);
        n++;
      }
    }
    im.count = n;
    im.castShadow = quality === 'high'; im.receiveShadow = true;   // QA perf: ~54k triangles in the shadow pass
    im.name = 'bumpers';
    root.add(im);
    disposables.push(tireGeo);
  }

  // Bridge piers
  {
    const pierGeo = new THREE.BoxGeometry(1, 1, 1);
    const pierMat = mat(new THREE.MeshStandardMaterial({ color: style.pier, roughness: 0.85 }));
    const mats = [];
    for (const [a, b] of bridgeRuns) {
      const span = Math.round(26 / ds);
      for (let ii = a + Math.round(span / 2); ii < b - span / 3; ii += span) {
        const i = ii % N;
        if (gapMask[i]) continue;
        const top = py[i] - 2.4, bottom = WATER_LEVEL - 14;
        const hgt = top - bottom;
        const m4 = new THREE.Matrix4().makeRotationY(head[i]);
        m4.scale(new THREE.Vector3(wallR[i] + wallL[i] - 2, hgt, 2.6));
        const off = (wallR[i] - wallL[i]) / 2;
        m4.setPosition(px[i] + rx[i] * off, bottom + hgt / 2, pz[i] + rz[i] * off);
        mats.push(m4);
      }
    }
    const im = new THREE.InstancedMesh(pierGeo, pierMat, Math.max(1, mats.length));
    mats.forEach((m4, k) => im.setMatrixAt(k, m4));
    im.count = mats.length;
    im.castShadow = true; im.receiveShadow = true;
    im.name = 'piers';
    root.add(im);
    disposables.push(pierGeo);
  }

  // ------------------------------------------------------------------ boost pads & ramps
  const boostTex = TX.makeBoostTexture();
  const boostMat = mat(new THREE.MeshBasicMaterial({
    map: boostTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  boostMat.color.setScalar(1.2);
  addMerged(boostPads.map((p) => extrude(p.s0, p.s0 + p.len, () => [[p.lat - p.hw, 0.04], [p.lat + p.hw, 0.04]], { across: [0, 1], alongScale: p.len * ds / 2 })), boostMat, { name: 'boostPads' });
  {
    const rampMat = mat(new THREE.MeshStandardMaterial({ map: TX.makeRampTexture(world), roughness: 0.5, side: THREE.DoubleSide }));
    const sideMat = mat(new THREE.MeshStandardMaterial({ color: style.ramp, roughness: 0.6, side: THREE.DoubleSide }));
    const tops = [], sides = [];
    for (const r of ramps) {
      const hAt = (ii) => r.h * clamp((ii - r.s0) / r.len, 0, 1);
      tops.push(extrude(r.s0, r.s0 + r.len, (i, ii) => [[-r.hw, hAt(ii) + 0.03], [r.hw, hAt(ii) + 0.03]], { across: [0, 1], alongScale: r.len * ds }));
      sides.push(extrude(r.s0, r.s0 + r.len, (i, ii) => [[r.hw, hAt(ii) + 0.03], [r.hw, -0.1]], { across: [0, 1] }));
      sides.push(extrude(r.s0, r.s0 + r.len, (i, ii) => [[-r.hw, -0.1], [-r.hw, hAt(ii) + 0.03]], { across: [0, 1] }));
      const e = (r.s0 + r.len) % N;
      sides.push(extrude(e, e + 0.001, (i, ii) => ii === e ? [[-r.hw, r.h + 0.03], [r.hw, r.h + 0.03]] : [[-r.hw, -0.1], [r.hw, -0.1]], { across: [0, 1] }));
    }
    addMerged(tops, rampMat, { cast: true, name: 'ramps' });
    addMerged(sides, sideMat, { cast: true, name: 'rampSides' });
  }

  // ------------------------------------------------------------------ start line, grid, gantry
  const decalMat = (o) => mat(new THREE.MeshStandardMaterial({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...o }));
  {
    const chk = TX.makeCheckerTexture(12, 2);
    const w = Math.max(2, Math.round(1.5 / ds));
    addMesh(extrude(N - w, N + w, () => [[-HALF_W, 0.02], [HALF_W, 0.02]], { across: [0, 1], alongScale: 2 * w * ds }), decalMat({ map: chk }), { name: 'startLine' });
    const slotGeos = [];
    for (const sp of startPositions) {
      const h = sp.heading;
      const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
      const right = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h));
      const addBar = (w2, l2, offF, offR) => {
        const g = new THREE.PlaneGeometry(w2, l2).rotateX(-Math.PI / 2).rotateY(h);
        const c = sp.position.clone().addScaledVector(fwd, offF).addScaledVector(right, offR);
        g.translate(c.x, c.y + 0.025, c.z);
        slotGeos.push(g);
      };
      addBar(3.6, 0.35, 2.0, 0);
      addBar(0.3, 1.6, 1.3, 1.65);
      addBar(0.3, 1.6, 1.3, -1.65);
    }
    addMerged(slotGeos, decalMat({ color: 0xfff7dc }), { name: 'gridMarks' });
  }

  // Gantry arch: two striped pillars topped with stars, a ribbon banner, a lamp housing (merged where possible)
  const lamps = [];
  {
    const g = new THREE.Group();
    g.position.set(px[0], py[0], pz[0]);
    g.rotation.y = head[0];
    g.name = 'gantry';
    // local frame: +Z forward, +X = left (right is -X)
    const xL = wallL[0] + 2.2, xR = -(wallR[0] + 2.2);
    const [cA, cB, cC] = style.gantry.map((h) => new THREE.Color(h));
    const vc = (geo, col) => {
      const gg = geo.index ? geo.toNonIndexed() : geo;
      if (gg !== geo) geo.dispose();
      gg.deleteAttribute('uv');
      const n = gg.attributes.position.count, arr = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { arr[k * 3] = col.r; arr[k * 3 + 1] = col.g; arr[k * 3 + 2] = col.b; }
      gg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return gg;
    };
    const parts = [];
    for (const x of [xL, xR]) {
      for (let k = 0; k < 6; k++) parts.push(vc(new THREE.CylinderGeometry(0.95, 1.05, 2, 14).translate(x, 1 + k * 2, 0), k % 2 ? cB : cA));
      parts.push(vc(new THREE.SphereGeometry(1.25, 14, 10).translate(x, 12.6, 0), cC));
      // star on top
      const st = new THREE.OctahedronGeometry(1.0, 0).scale(1, 1.3, 0.35).translate(x, 14.6, 0);
      parts.push(vc(st, new THREE.Color(0xedc371)));
    }
    const span = xL - xR + 2.5;
    parts.push(vc(new THREE.BoxGeometry(span, 0.5, 1.6).translate((xL + xR) / 2, 12.75, 0), cC));
    parts.push(vc(new THREE.BoxGeometry(span, 0.5, 1.6).translate((xL + xR) / 2, 9.25, 0), cC));
    parts.push(vc(new THREE.BoxGeometry(6.5, 2, 0.8).translate(0, 7.9, -0.4), new THREE.Color(0x2b2f45)));
    const frameGeo = safeMerge(parts) || new THREE.BufferGeometry();
    const frame = new THREE.Mesh(frameGeo, mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })));
    frame.castShadow = true;
    disposables.push(frameGeo);
    g.add(frame);
    const bannerTex = TX.makeBannerTexture((def.banner || def.short || def.name || 'LUMEN KART').toUpperCase(), style.banner);
    disposables.push(bannerTex);
    const bannerGeo = new THREE.PlaneGeometry(span - 0.4, 3);
    disposables.push(bannerGeo);
    // Two single-sided faces back to back: a DoubleSide plane showed the name mirrored from behind
    // (intro fly-by, look-back, time-trial grid).
    const bannerMat = mat(new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.6 }));
    for (const ry of [Math.PI, 0]) {
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set((xL + xR) / 2, 11, -0.05);
      banner.rotation.y = ry;   // PI: readable from the grid; 0: readable after the line
      g.add(banner);
    }
    const lampGeo = new THREE.SphereGeometry(0.62, 14, 10);
    disposables.push(lampGeo);
    for (let k = 0; k < 3; k++) {
      const lm = mat(new THREE.MeshStandardMaterial({ color: 0x3a3450, emissive: 0x000000, roughness: 0.3 }));
      const lamp = new THREE.Mesh(lampGeo, lm);
      lamp.position.set((k - 1) * 2, 7.9, -0.85);
      g.add(lamp); lamps.push(lm);
    }
    root.add(g);
  }
  const setLamps = (n, color) => {
    lamps.forEach((m, k) => {
      const on = k < n;
      m.emissive.setHex(on ? color : 0x000000);
      m.emissiveIntensity = on ? 3 : 0;
      m.color.setHex(on ? color : 0x3a3450);
    });
  };
  let lampTimer = 0;
  const unsub = [
    bus.on('race:countdown', (d) => { const n = d && d.n; setLamps(n === 3 ? 1 : n === 2 ? 2 : 3, 0xff8a5c); lampTimer = 0; }),
    bus.on('race:go', () => { setLamps(3, 0x7dffb0); lampTimer = 3; }),
  ];

  // points along the invisible edge of shortcut openings (environment dresses them with hedges/flowers)
  const openEdges = [];
  for (const z of shortcutZones) {
    const W = z.side > 0 ? wallR : wallL;
    const step = Math.max(1, Math.round(3 / ds));
    for (let ii = z.s0 - Math.round(40 / ds); ii <= z.s1 + Math.round(40 / ds); ii += step) {
      const i = ((ii % N) + N) % N;
      const w = W[i];
      if (w <= HALF_W + 8 || w >= OPEN_W - 0.5) continue;
      const inner = z.side > 0 ? Math.max(0, -kS[i]) : Math.max(0, kS[i]);
      if (inner > 1e-4 && w > 1 / inner - 2) continue;
      if (w > clear[i] / 2 + 6) continue;
      openEdges.push({ x: px[i] + rx[i] * z.side * (w + 1.2), z: pz[i] + rz[i] * z.side * (w + 1.2), y: py[i], i });
    }
  }

  // ------------------------------------------------------------------ environment
  const layout = {
    N, ds, length, px, py, pz, rx, rz, tx, tz, head, kS, wallL, wallR, bridge, halfWidth: HALF_W, clear,
    nearest: (x, z, noFallback = false) => { const i = nearestGrid(x, z, noFallback); return { i, d2: _nd2 }; },
    lake: LAKE, waterLevel: WATER_LEVEL, theme: world, world, openBridge: OPEN_BRIDGE, gapMask, openR, openL,
    shortcutZones, openEdges, quality, pitKind, def, mirror,
    bounds: { minX, maxX, minZ, maxZ },
    boostPads, ramps, startPositions,
  };
  const env = createEnvironment(scene, renderer, root, layout);

  // ------------------------------------------------------------------ Track object
  Object.assign(track, {
    name: def.name,
    names: def.names || { fr: def.name, en: def.name },
    id: def.id,
    def,
    theme: world,
    world,
    pitKind,
    quality,
    mirror,
    coinPositions,
    hazardDefs,
    gaps: gaps.map((g) => ({ t0: g.s0 / N, t1: ((g.s0 + g.len) % N) / N })),
    shortcuts: shortcutZones.map((z) => ({ t0: (z.s0 % N) / N, t1: (z.s1 % N) / N, side: z.side })),
    /** World point at track parameter t with lateral offset (+ = right). */
    pointAt(t, lat = 0, out = new THREE.Vector3()) {
      const s = (((t % 1) + 1) % 1) * N, a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
      let rxi = lerpArr(rx, a, b, f), rzi = lerpArr(rz, a, b, f);
      const rl = Math.hypot(rxi, rzi) || 1; rxi /= rl; rzi /= rl;
      return out.set(lerpArr(px, a, b, f) + rxi * lat, lerpArr(py, a, b, f), lerpArr(pz, a, b, f) + rzi * lat);
    },
    headingAt(t) {
      const s = (((t % 1) + 1) % 1) * N, a = Math.floor(s) % N;
      return head[a];
    },
    /** Safe t to drop a recovered kart: never inside (or on the run-up to) a road gap. */
    getRespawnT(t) {
      let tt = ((t % 1) + 1) % 1;
      for (const g of gaps) {
        const s = tt * N;
        const back = Math.round(70 / ds);
        const start = g.rampS0 - back;
        const end = g.s0 + g.len + Math.round(3 / ds);
        let d = s - start; if (d < 0) d += N;
        if (d <= end - start) tt = (((start / N) % 1) + 1) % 1;
      }
      return tt;
    },
    curve,
    length,
    roadWidth: HALF_W * 2,
    startPositions,
    itemBoxPositions,
    minimap,
    getSurfaceInfo,
    resolveWall,
    getPointAt,
    getTangentAt,
    getRacingLine,
    // extras
    boostPads: boostPads.map((p) => ({ t: p.s0 / N, lateral: p.lat, length: p.len * ds, halfWidth: p.hw })),
    jumpRamps: ramps.map((r) => ({ t: r.s0 / N, length: r.len * ds, halfWidth: r.hw, height: r.h })),
    waterLevel: WATER_LEVEL,
    sunLight: env.sunLight,
    getWallOffsets(t) {
      const s = (((t % 1) + 1) % 1) * N, a = Math.floor(s) % N, b = (a + 1) % N, f = s - Math.floor(s);
      return { left: lerpArr(wallL, a, b, f), right: lerpArr(wallR, a, b, f) };
    },
    setShadowFocus(v) { env.setShadowFocus(v); },
    update(dt, time) {
      try {
        const tt = typeof time === 'number' ? time : 0;
        boostTex.offset.y = -((tt * 1.6) % 1);
        if (lampTimer > 0) { lampTimer -= dt || 0; if (lampTimer <= 0) setLamps(0, 0); }
        env.update(dt || 0, tt);
      } catch (e) { /* never throw in the frame loop */ }
    },
    dispose() {
      unsub.forEach((u) => u && u());
      env.dispose();
      root.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      disposables.forEach((d) => d && d.dispose && d.dispose());
      scene.remove(root);
    },
  });
  return track;
}
