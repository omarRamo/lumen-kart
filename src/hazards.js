// Track hazards as gentle LUMEN creatures. Defined per course in tracks.js (resolved by track.js into
// track.hazardDefs) and animated deterministically from the race clock (online guests see the host's motion).
//   crab (lagoon) · sheep, dandelion (meadow) · frog (jungle) · boulder, tumbleweed (desert; boulder with
//   `lava: true` is the night world's shadow orb) · cat (medina) · pigeon (city) · snowman, snowball (aurora) ·
//   stomper (night: shadow stomper).
// Each creature is ONE merged, vertex-coloured mesh (one draw call) built once per type and shared.
// API (unchanged): new HazardSystem({ scene, track, karts }); update(dt, time, { collisions }); getHazards(); dispose().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bus } from './events.js';

const TAU = Math.PI * 2;

// Robust merge: normalises index / attribute sets so mergeGeometries never fails; returns null if it still does.
function safeMerge(parts, dispose = true) {
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


// motion: 'side' = lateral sweep, 'roll' = rolling ball, 'hop' = hopping sweep, 'prowl' = dash & rest
const SPEC = {
  crab: { radius: 1.0, hit: 'spin', period: 4.2, solid: false, motion: 'side' },
  sheep: { radius: 1.5, hit: 'bump', period: 9.0, solid: false, motion: 'side', walk: true },
  dandelion: { radius: 1.3, hit: 'bump', period: 4.4, solid: false, motion: 'roll', bounce: 1.2 },
  frog: { radius: 1.05, hit: 'spin', period: 5.2, solid: false, motion: 'hop' },
  cat: { radius: 0.95, hit: 'spin', period: 7.0, solid: false, motion: 'prowl', walk: true },
  pigeon: { radius: 1.5, hit: 'bump', period: 5.6, solid: false, motion: 'hop', small: true },
  snowman: { radius: 1.4, hit: 'spin', solid: true, breakable: true },
  snowball: { radius: 2.3, hit: 'tumble', period: 6.5, solid: true, motion: 'roll' },
  boulder: { radius: 2.5, hit: 'tumble', period: 7.5, solid: true, motion: 'roll' },
  tumbleweed: { radius: 1.3, hit: 'bump', period: 3.6, solid: false, motion: 'roll', bounce: 1.6 },
  stomper: { radius: 2.9, hit: 'squash', period: 3.8, solid: true },
};

function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Geometry builders. Models face +Z, origin at ground contact (rolling balls: origin at centre).
function buildGeometry(type, def) {
  const P = [];
  const add = (g, col, x = 0, y = 0, z = 0) => { g.translate(x, y, z); P.push(paint(g, col)); };
  const eyes = (x, y, z, r, white = 0xffffff, pupil = 0x25303b) => {
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(r, 10, 8), white, s * x, y, z);
      add(new THREE.SphereGeometry(r * 0.55, 8, 6), pupil, s * x, y + r * 0.1, z + r * 0.6);
      add(new THREE.SphereGeometry(r * 0.18, 6, 4), 0xffffff, s * x + r * 0.15, y + r * 0.35, z + r * 0.95);
    }
  };
  switch (type) {
    case 'crab': {
      const red = 0xf06a4a, light = 0xffb08a;
      add(new THREE.SphereGeometry(0.85, 16, 10).scale(1.3, 0.6, 1), red, 0, 0.6, 0);
      add(new THREE.SphereGeometry(0.6, 12, 8).scale(1.3, 0.35, 0.9), light, 0, 0.42, 0.15);
      for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.4, 10, 8).scale(1.25, 0.85, 0.85), red, s * 1.45, 0.75, 0.55);
        add(new THREE.ConeGeometry(0.16, 0.45, 6).rotateZ(s * 1.2), light, s * 1.75, 0.95, 0.65);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 5), red, s * 0.28, 1.08, 0.35);
        for (let k = 0; k < 3; k++) add(new THREE.CylinderGeometry(0.06, 0.05, 0.85, 5).rotateZ(s * 0.95), red, s * (0.95 + k * 0.05), 0.32, -0.35 + k * 0.3);
      }
      eyes(0.28, 1.36, 0.35, 0.16);
      break;
    }
    case 'sheep': {
      const wool = 0xfffaf0, face = 0x4a4048;
      const puffs = [[0, 1.25, 0, 0.85], [0.55, 1.2, 0.35, 0.6], [-0.55, 1.2, 0.35, 0.6], [0.5, 1.25, -0.45, 0.62], [-0.5, 1.25, -0.45, 0.62], [0, 1.75, -0.1, 0.6], [0, 1.15, -0.8, 0.55]];
      for (const [x, y, z, r] of puffs) add(new THREE.IcosahedronGeometry(r, 1), wool, x, y, z);
      add(new THREE.SphereGeometry(0.46, 12, 10).scale(0.9, 1.0, 1.05), face, 0, 1.35, 0.95);
      add(new THREE.IcosahedronGeometry(0.32, 1), wool, 0, 1.78, 0.85);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.16, 8, 6).scale(1.6, 0.6, 0.8), face, s * 0.5, 1.45, 0.85);
      // sleepy eyes: closed lids (cream arcs)
      for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.1, 0.03, 4, 8, Math.PI).rotateZ(Math.PI), 0xfff2d6, s * 0.17, 1.42, 1.36);
      add(new THREE.SphereGeometry(0.07, 6, 4), 0xedba9c, 0, 1.22, 1.38);
      for (const [x, z] of [[-0.42, -0.45], [0.42, -0.45], [-0.42, 0.45], [0.42, 0.45]]) add(new THREE.CylinderGeometry(0.11, 0.1, 0.75, 6), face, x, 0.38, z);
      break;
    }
    case 'dandelion': {
      add(new THREE.SphereGeometry(0.35, 10, 8), 0xe8d9a0, 0, 0, 0);
      const n = 26;
      for (let k = 0; k < n; k++) {
        const y = 1 - (k + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = k * 2.399;
        const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const stalk = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 3).translate(0, 0.75, 0).applyQuaternion(q);
        P.push(paint(stalk, 0xf6f2e4));
        const puff = new THREE.SphereGeometry(0.2, 6, 4).translate(0, 1.2, 0).applyQuaternion(q);
        P.push(paint(puff, 0xffffff));
      }
      break;
    }
    case 'frog': {
      const green = 0x47b36b, belly = 0xd8f0a0, dark = 0x2f8a4a;
      add(new THREE.SphereGeometry(0.75, 14, 10).scale(1.1, 0.75, 1.15), green, 0, 0.6, 0);
      add(new THREE.SphereGeometry(0.55, 12, 8).scale(1.1, 0.6, 1.0), belly, 0, 0.42, 0.28);
      for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.3, 10, 8), green, s * 0.38, 1.08, 0.35);
        add(new THREE.SphereGeometry(0.34, 10, 8).scale(1.3, 0.55, 1.6), dark, s * 0.68, 0.32, -0.25);
        add(new THREE.SphereGeometry(0.16, 8, 6).scale(1.6, 0.4, 1.4), dark, s * 0.95, 0.06, 0.05);
        add(new THREE.SphereGeometry(0.13, 8, 6).scale(1.5, 0.45, 1.5), dark, s * 0.5, 0.08, 0.68);
        add(new THREE.SphereGeometry(0.08, 6, 4), 0xff9a8a, s * 0.45, 0.72, 0.78);
      }
      eyes(0.38, 1.12, 0.48, 0.2, 0xfff6c8, 0x1f2a2a);
      add(new THREE.TorusGeometry(0.22, 0.035, 4, 10, Math.PI).rotateZ(Math.PI), 0x2a5a3a, 0, 0.72, 0.84);
      break;
    }
    case 'cat': {
      const coat = 0xffffff;      // per-instance tint lives in the vertex colour below
      const fur = [0xf0a35a, 0xf6f0e6, 0x8a8a96][def.variant || 0] ?? 0xf0a35a;
      add(new THREE.SphereGeometry(0.5, 12, 8).scale(0.85, 0.8, 1.45), fur, 0, 0.62, 0);
      add(new THREE.SphereGeometry(0.42, 12, 10), fur, 0, 1.1, 0.62);
      for (const s of [-1, 1]) {
        add(new THREE.ConeGeometry(0.16, 0.32, 4).rotateZ(s * -0.25), fur, s * 0.24, 1.5, 0.6);
        add(new THREE.ConeGeometry(0.08, 0.18, 4).rotateZ(s * -0.25), 0xf6b8b0, s * 0.24, 1.48, 0.66);
      }
      for (const [x, z] of [[-0.25, -0.45], [0.25, -0.45], [-0.25, 0.42], [0.25, 0.42]]) add(new THREE.CylinderGeometry(0.09, 0.08, 0.42, 6), fur, x, 0.21, z);
      add(new THREE.CylinderGeometry(0.07, 0.05, 1.1, 6).rotateX(-0.9), fur, 0, 1.0, -0.95);
      add(new THREE.SphereGeometry(0.16, 8, 6).scale(1.4, 0.8, 1), 0xfff7ec, 0, 0.98, 0.98);
      add(new THREE.SphereGeometry(0.05, 6, 4), 0xe8869a, 0, 1.06, 1.05);
      eyes(0.17, 1.2, 0.92, 0.1, 0xc8f08a, 0x22302a);
      void coat;
      break;
    }
    case 'pigeon': {
      // a little flock of three
      for (const [ox, oz, s] of [[0, 0.3, 1], [-0.9, -0.5, 0.85], [0.95, -0.4, 0.9]]) {
        const parts = [];
        const at = (g, col, x, y, z) => { g.translate(x, y, z); parts.push(paint(g, col)); };
        at(new THREE.SphereGeometry(0.42, 10, 8).scale(0.9, 0.8, 1.35), 0xa8aec0, 0, 0.55, 0);
        at(new THREE.SphereGeometry(0.28, 10, 8), 0x8f96ac, 0, 0.95, 0.38);
        at(new THREE.TorusGeometry(0.22, 0.07, 4, 10).rotateX(Math.PI / 2), 0x7fc8a8, 0, 0.78, 0.3);
        at(new THREE.ConeGeometry(0.07, 0.2, 5).rotateX(Math.PI / 2), 0xf0a050, 0, 0.92, 0.7);
        at(new THREE.ConeGeometry(0.3, 0.6, 4).rotateX(-1.4), 0x7f869c, 0, 0.6, -0.65);
        for (const sd of [-1, 1]) {
          at(new THREE.SphereGeometry(0.3, 8, 6).scale(0.35, 0.6, 1.2), 0x969db2, sd * 0.36, 0.62, -0.05);
          at(new THREE.SphereGeometry(0.06, 6, 4), 0x20202a, sd * 0.15, 1.0, 0.6);
          at(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), 0xf0a050, sd * 0.12, 0.15, 0);
        }
        const g = safeMerge(parts);
        if (!g) break;
        g.scale(s * 1.5, s * 1.5, s * 1.5); g.translate(ox * 1.4, 0, oz * 1.4);
        P.push(g);
      }
      break;
    }
    case 'snowman': {
      const snow = 0xf6faff, coal = 0x2a2a38, carrot = 0xff8a3a, scarf = 0xe98c73;
      add(new THREE.SphereGeometry(1.25, 18, 12), snow, 0, 1.1, 0);
      add(new THREE.SphereGeometry(0.9, 18, 12), snow, 0, 2.7, 0);
      add(new THREE.SphereGeometry(0.62, 16, 10), snow, 0, 3.9, 0);
      add(new THREE.TorusGeometry(0.62, 0.17, 8, 18).rotateX(Math.PI / 2), scarf, 0, 3.4, 0);
      add(new THREE.BoxGeometry(0.3, 0.9, 0.12).rotateZ(0.3), scarf, 0.45, 3.0, 0.62);
      add(new THREE.ConeGeometry(0.12, 0.6, 8).rotateX(Math.PI / 2), carrot, 0, 3.9, 0.85);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.09, 6, 4), coal, s * 0.22, 4.1, 0.55);
      for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.09, 6, 4), coal, 0, 2.4 + k * 0.32, 0.86 - Math.abs(k - 1) * 0.05);
      add(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 14), 0x3f5f9a, 0, 4.45, 0);
      add(new THREE.SphereGeometry(0.16, 8, 6), 0xfff7dc, 0, 4.8, 0);
      for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 4).rotateZ(s * 1.0), 0x6a4a34, s * 1.2, 2.9, 0);
      break;
    }
    case 'snowball': {
      const g = new THREE.IcosahedronGeometry(2.3, 2);
      P.push(paint(g, 0xf2f7ff));
      add(new THREE.IcosahedronGeometry(0.5, 1), 0xdfe9f5, 1.6, 1.2, 0.8);
      add(new THREE.IcosahedronGeometry(0.4, 1), 0xdfe9f5, -1.3, -1.0, 1.4);
      break;
    }
    case 'boulder': {
      if (def.lava || def.world === 'night') {
        // shadow orb: indigo with golden star specks
        P.push(paint(new THREE.IcosahedronGeometry(2.5, 2), 0x2b2160));
        for (let k = 0; k < 9; k++) {
          const a = k * 2.399, y = 1 - (k + 0.5) / 9 * 2, r = Math.sqrt(1 - y * y);
          add(new THREE.OctahedronGeometry(0.32, 0), 0xf3d096, Math.cos(a) * r * 2.45, y * 2.45, Math.sin(a) * r * 2.45);
        }
      } else {
        // sandstone ball with soft strata
        const g = new THREE.DodecahedronGeometry(2.5, 2);
        const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = new THREE.Color();
        const bands = [0xd98a5a, 0xe8a870, 0xc8703e, 0xf0c090];
        for (let i = 0; i < n; i += 3) {
          const y = (g.attributes.position.getY(i) + g.attributes.position.getY(i + 1) + g.attributes.position.getY(i + 2)) / 3;
          c.setHex(bands[Math.floor((y + 2.5) * 1.2) % bands.length]);
          for (let j = 0; j < 3; j++) { arr[(i + j) * 3] = c.r; arr[(i + j) * 3 + 1] = c.g; arr[(i + j) * 3 + 2] = c.b; }
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
        g.deleteAttribute('uv');
        P.push(g);
      }
      break;
    }
    case 'tumbleweed': {
      for (let k = 0; k < 9; k++) {
        const t = new THREE.TorusGeometry(1.0 + (k % 3) * 0.12, 0.05, 4, 14).rotateX(k * 0.7).rotateY(k * 1.3);
        P.push(paint(t, [0xc09a5a, 0xa8844a, 0xd0ac6a][k % 3]));
      }
      break;
    }
    case 'stomper': {
      const stone = 0x463f8a, edge = 0x5b4fb0, glow = 0xdbd0ff;
      add(new THREE.BoxGeometry(5.2, 3.6, 5.2), stone, 0, 1.8, 0);
      add(new THREE.BoxGeometry(5.4, 0.35, 5.4), edge, 0, 3.55, 0);
      add(new THREE.BoxGeometry(5.4, 0.35, 5.4), edge, 0, 0.18, 0);
      for (const side of [1, -1]) {
        // a sleepy face on the two faces along the road: glowing eyes + small mouth
        for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.5, 10, 8).scale(1, 0.6, 0.3), glow, s * 1.15, 2.2, side * 2.62);
        add(new THREE.BoxGeometry(1.2, 0.18, 0.12), glow, 0, 1.25, side * 2.62);
      }
      for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) add(new THREE.OctahedronGeometry(0.55, 0).scale(1, 1.4, 1), 0xf3d096, x, 4.2, z);
      break;
    }
    default: return null;
  }
  const g = safeMerge(P);
  if (!g) return null;
  g.computeBoundingSphere();
  return g;
}

export class HazardSystem {
  constructor({ scene, track, karts }) {
    this.scene = scene;
    this.track = track;
    this.karts = karts || [];
    this.group = new THREE.Group();
    this.group.name = 'hazards';
    scene.add(this.group);
    this.disposables = [];
    this.items = [];
    this._out = [];
    this.time = 0;
    this._v = new THREE.Vector3();
    const night = track?.world === 'night' || track?.theme === 'night' || track?.theme === 'lava';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
    const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x2a2060, emissiveIntensity: 1 });
    this.disposables.push(mat, glowMat);
    const geos = new Map();
    let shadowGeo = null, shadowMat = null;
    (track?.hazardDefs || []).forEach((d, idx) => {
      const spec = SPEC[d.type];
      if (!spec) return;
      const variant = d.type === 'cat' ? idx % 3 : 0;
      const key = d.type + (d.lava ? ':lava' : '') + ':' + variant;
      let g = geos.get(key);
      if (!g) {
        try { g = buildGeometry(d.type, { ...d, variant, world: night ? 'night' : d.world }); } catch (e) { g = null; }
        if (!g) return;
        geos.set(key, g); this.disposables.push(g);
      }
      const mesh = new THREE.Mesh(g, (d.type === 'stomper' || d.lava) ? glowMat : mat);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'hazard-' + d.type;
      const model = new THREE.Group();
      model.add(mesh);
      this.group.add(model);
      if (d.type === 'stomper') {
        if (!shadowGeo) {
          shadowGeo = new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2);
          shadowMat = new THREE.MeshBasicMaterial({ color: 0x120c38, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
          this.disposables.push(shadowGeo, shadowMat);
        }
        const sh = new THREE.Mesh(shadowGeo, shadowMat.clone());
        this.disposables.push(sh.material);
        sh.name = 'shadow';
        model.userData.shadow = sh;
        this.group.add(sh);
      }
      const h = {
        def: d, type: d.type, spec, model, mesh,
        pos: new THREE.Vector3(), roll: 0, lastLat: 0, dir: 1,
        phase: d.phase || 0,   // deterministic so online guests see the same motion as the host
        broken: 0, cool: new Map(), state: 'up', y: 0,
        hazard: { position: new THREE.Vector3(), radius: spec.radius, type: d.type },
      };
      track.pointAt(d.t, d.lat || 0, h.pos);
      h.baseY = h.pos.y;
      h.lastLat = d.lat || 0;
      h.heading = track.headingAt ? track.headingAt(d.t) : 0;
      model.position.copy(h.pos);
      model.rotation.y = d.type === 'stomper' ? h.heading + Math.PI : h.heading;
      this.items.push(h);
    });
  }

  /** Hazards for AI avoidance (only while dangerous). */
  getHazards() {
    const out = this._out; out.length = 0;
    for (const h of this.items) {
      if (h.broken > 0) continue;
      if (h.type === 'stomper' && h.state === 'up') continue;
      h.hazard.position.copy(h.pos);
      out.push(h.hazard);
    }
    return out;
  }

  /** opts.collisions = false animates only (online guests render host-simulated karts). */
  update(dt, time, { collisions = true } = {}) {
    if (!(dt > 0)) return;
    this.time = time;
    this._collide = collisions;
    for (const h of this.items) {
      try { this._updateOne(h, dt, time); } catch (e) { /* never throw */ }
    }
  }

  // lateral offset at a given time (pure function of time → deterministic)
  _lateral(h, time) {
    const d = h.def, sp = h.spec;
    const amp = d.amp || 8;
    const w = TAU / sp.period;
    const s = Math.sin(time * w + h.phase * 3);
    if (sp.motion === 'prowl') return (d.lat || 0) + amp * Math.sign(s) * Math.pow(Math.abs(s), 0.35);
    return (d.lat || 0) + amp * s;
  }

  _updateOne(h, dt, time) {
    const d = h.def, sp = h.spec, tr = this.track;
    for (const [k, v] of h.cool) { if (v - dt <= 0) h.cool.delete(k); else h.cool.set(k, v - dt); }
    if (h.broken > 0) {
      h.broken -= dt;
      h.model.visible = h.broken <= 0;
      if (h.broken <= 0) h.model.scale.setScalar(0.01);
      return;
    }
    if (h.model.scale.x < 1) h.model.scale.setScalar(Math.min(1, h.model.scale.x + dt * 2));

    let dangerY = null; // for stompers: vertical extent check
    const m = h.model;
    if (sp.period && h.type !== 'stomper') {
      const lat = this._lateral(h, time);
      tr.pointAt(d.t, lat, h.pos);
      const dl = lat - h.lastLat; h.lastLat = lat;
      if (Math.abs(dl) > 1e-4) h.dir = dl > 0 ? 1 : -1;
      const r = sp.radius;
      if (sp.motion === 'roll') {
        const bounce = sp.bounce ? Math.abs(Math.sin(time * 5 + h.phase)) * sp.bounce : 0;
        h.pos.y += r + bounce;
        h.roll += dl / r;
        m.position.copy(h.pos);
        m.rotation.set(0, h.heading, 0);
        m.rotateZ(-h.roll);
        if (h.type === 'tumbleweed' || h.type === 'dandelion') m.rotateX(time * 2.5);
      } else {
        m.position.copy(h.pos);
        if (h.type === 'crab') {
          m.position.y += Math.abs(Math.sin(time * 14)) * 0.12;
          m.rotation.set(0, h.heading, Math.sin(time * 14) * 0.08);
        } else {
          // walkers face where they are going (right of the race direction = heading - π/2)
          const face = h.heading - h.dir * Math.PI / 2;
          let yaw = m.rotation.y;
          let dy = face - yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
          yaw += dy * Math.min(1, dt * 8);
          if (sp.motion === 'hop') {
            const f = sp.small ? 9 : 5.5;
            const hop = Math.abs(Math.sin(time * f + h.phase * 2));
            m.position.y += hop * (sp.small ? 0.35 : 1.3);
            m.rotation.set(-hop * 0.25, yaw, 0);
          } else {
            const moving = Math.abs(dl) / Math.max(dt, 1e-3) > 0.4;
            const bob = moving ? Math.abs(Math.sin(time * 9 + h.phase)) * 0.12 : Math.sin(time * 1.6 + h.phase) * 0.03;
            m.position.y += bob;
            m.rotation.set(0, yaw, moving ? Math.sin(time * 9) * 0.05 : 0);
          }
        }
      }
    } else if (h.type === 'stomper') {
      const P = sp.period;
      const ph = ((time + h.phase) % P + P) % P;
      const top = 7.5;
      let y, state;
      if (ph < 1.2) { y = top + Math.sin(time * 2) * 0.2; state = 'up'; }
      else if (ph < 1.65) { y = top + Math.sin(time * 60) * 0.12; state = 'warn'; }
      else if (ph < 1.82) { const f = (ph - 1.65) / 0.17; y = top * (1 - f * f); state = 'slam'; }
      else if (ph < 2.95) { y = 0; state = 'down'; }
      else { y = top * ((ph - 2.95) / (P - 2.95)); state = 'rise'; }
      if (state === 'down' && h.state === 'slam') bus.emit('hazard:stomp', { position: h.pos.clone() });
      h.state = state; h.y = y;
      m.position.set(h.pos.x, h.baseY + y, h.pos.z);
      const sh = m.userData.shadow;
      if (sh) {
        sh.position.set(h.pos.x, h.baseY + 0.05, h.pos.z);
        const k = 1 - Math.min(1, y / top);
        sh.material.opacity = 0.18 + 0.4 * k;
        sh.scale.setScalar(0.7 + 0.35 * k);
      }
      dangerY = y;
    } else {
      m.position.copy(h.pos);
      if (h.type === 'snowman') m.rotation.set(0, h.heading + Math.PI + Math.sin(time * 1.3 + h.phase) * 0.15, Math.sin(time * 2 + h.phase) * 0.04);
    }

    // collisions
    if (this._collide === false) return;
    for (const k of this.karts) {
      if (!k || !k.position || k.fallTimer > 0 || k.respawnTimer > 0 || k.ghostTimer > 0) continue;
      const dx = k.position.x - h.pos.x, dz = k.position.z - h.pos.z;
      const kr = k.radius || 1.3;
      if (h.type === 'stomper') {
        const half = 2.6 + kr * 0.8;
        const c = Math.cos(h.heading), s = Math.sin(h.heading);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) > half || Math.abs(lz) > half) continue;
        const bottom = h.baseY + dangerY;
        if (h.state === 'slam' && k.position.y < bottom + 1.5) {
          if (!h.cool.has(k)) { h.cool.set(k, 1.0); if (k.applyHit?.('squash') !== false) bus.emit('hazard:hit', { kart: k, type: h.type }); }
        } else if ((h.state === 'down' || (h.state === 'rise' && dangerY < 2)) && k.position.y < bottom + 3) {
          const ox = half - Math.abs(lx), oz = half - Math.abs(lz);
          let px = 0, pz = 0;
          if (ox < oz) px = Math.sign(lx) * ox; else pz = Math.sign(lz) * oz;
          const wx = px * c + pz * s, wz = -px * s + pz * c;
          k.position.x += wx; k.position.z += wz;
          const n = Math.hypot(wx, wz) || 1, nx = wx / n, nz = wz / n;
          const vn = k.velocity.x * nx + k.velocity.z * nz;
          if (vn < 0) { k.velocity.x -= nx * vn * 1.4; k.velocity.z -= nz * vn * 1.4; if (-vn > 6) bus.emit('kart:wallBump', { kart: k, intensity: Math.min(1, -vn / 25), impactSpeed: -vn }); }
        }
        continue;
      }
      const rr = sp.radius + kr * 0.85;
      if (dx * dx + dz * dz > rr * rr) continue;
      if (Math.abs(k.position.y + 0.6 - h.pos.y) > sp.radius + 1.6) continue;
      const star = k.starTimer > 0 || k.rocketTimer > 0;
      if (sp.breakable && (star || !h.cool.has(k))) {
        h.broken = 9; h.model.visible = false;
        bus.emit('hazard:smash', { position: h.pos.clone().setY(h.pos.y + 2), type: h.type });
        if (!star && k.applyHit?.(sp.hit) !== false) bus.emit('hazard:hit', { kart: k, type: h.type });
        break;
      }
      if (!h.cool.has(k)) {
        h.cool.set(k, 1.2);
        if (star) bus.emit('hazard:smash', { position: h.pos.clone(), type: h.type, bounce: true });
        else if (sp.hit === 'bump') {
          // light knock: scrub some speed, no spin-out
          k.velocity.x *= 0.7; k.velocity.z *= 0.7;
          bus.emit('kart:bump', { a: k, b: k, intensity: 0.4, impactSpeed: 8 });
        } else if (k.applyHit?.(sp.hit) !== false) bus.emit('hazard:hit', { kart: k, type: h.type });
      }
      if (sp.solid) {
        const dist = Math.hypot(dx, dz) || 1;
        const push = rr - dist;
        k.position.x += (dx / dist) * push; k.position.z += (dz / dist) * push;
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.disposables) d?.dispose?.();
    this.items.length = 0;
  }
}
