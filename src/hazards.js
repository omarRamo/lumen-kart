// Track hazards: scuttling crabs, snowmen, rolling snowballs/boulders, tumbleweeds and stone stompers
// that slam the road. Defined per track in tracks.js (resolved by track.js into track.hazardDefs).
import * as THREE from 'three';
import { bus } from './events.js';

const TAU = Math.PI * 2;
const _p = new THREE.Vector3();

const SPEC = {
  crab: { radius: 1.0, hit: 'spin', period: 4.2, solid: false },
  snowman: { radius: 1.4, hit: 'spin', solid: true, breakable: true },
  snowball: { radius: 2.3, hit: 'tumble', period: 6.5, solid: true },
  boulder: { radius: 2.5, hit: 'tumble', period: 7.5, solid: true },
  tumbleweed: { radius: 1.3, hit: 'bump', period: 3.6, solid: false },
  stomper: { radius: 2.9, hit: 'squash', period: 3.8, solid: true },
};

function faceTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'stomper') {
    g.fillStyle = '#7d7488'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) { g.fillStyle = ['#6f667a', '#8a8196', '#645c6e'][i % 3]; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
    g.strokeStyle = '#3a3342'; g.lineWidth = 4; g.strokeRect(4, 4, 120, 120);
    g.fillStyle = '#fff'; g.strokeStyle = '#1b1720'; g.lineWidth = 4;
    for (const x of [38, 90]) { g.beginPath(); g.ellipse(x, 52, 15, 17, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(x, 56, 7, 0, TAU); g.fill(); g.fillStyle = '#fff'; }
    g.lineWidth = 7; g.beginPath(); g.moveTo(20, 28); g.lineTo(56, 40); g.moveTo(108, 28); g.lineTo(72, 40); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(34, 86, 60, 20); g.strokeRect(34, 86, 60, 20);
    for (let x = 34; x < 94; x += 12) { g.beginPath(); g.moveTo(x, 86); g.lineTo(x, 106); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }); }

function buildModel(type, def, disposables) {
  const g = new THREE.Group();
  const keep = (x) => { disposables.push(x); return x; };
  const add = (geo, m, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(keep(geo), m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  switch (type) {
    case 'crab': {
      const red = keep(mat(0xe8452f, { roughness: 0.45 })), white = keep(mat(0xffffff)), black = keep(mat(0x111111));
      add(new THREE.SphereGeometry(0.8, 16, 10).scale(1.3, 0.55, 1), red, 0, 0.55, 0);
      for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.34, 10, 8).scale(1.2, 0.8, 0.8), red, s * 1.35, 0.7, 0.55);
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), red, s * 0.25, 1.05, 0.35);
        add(new THREE.SphereGeometry(0.13, 8, 6), white, s * 0.25, 1.28, 0.35);
        add(new THREE.SphereGeometry(0.06, 6, 4), black, s * 0.25, 1.3, 0.47);
        for (let k = 0; k < 3; k++) { const l = add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 5), red, s * (0.9 + k * 0.05), 0.3, -0.35 + k * 0.3); l.rotation.z = s * 0.9; }
      }
      break;
    }
    case 'snowman': {
      const snow = keep(mat(0xf6faff, { roughness: 0.9 })), coal = keep(mat(0x1a1a1a)), carrot = keep(mat(0xff8a1a)), scarf = keep(mat(0xe53935));
      add(new THREE.SphereGeometry(1.25, 18, 12), snow, 0, 1.1, 0);
      add(new THREE.SphereGeometry(0.9, 18, 12), snow, 0, 2.7, 0);
      add(new THREE.SphereGeometry(0.62, 16, 10), snow, 0, 3.9, 0);
      add(new THREE.TorusGeometry(0.62, 0.16, 8, 18).rotateX(Math.PI / 2), scarf, 0, 3.4, 0);
      const nose = add(new THREE.ConeGeometry(0.12, 0.6, 8), carrot, 0, 3.9, 0.85); nose.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.08, 6, 4), coal, s * 0.22, 4.1, 0.55);
      for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.09, 6, 4), coal, 0, 2.4 + k * 0.32, 0.86 - Math.abs(k - 1) * 0.05);
      add(new THREE.CylinderGeometry(0.45, 0.45, 0.6, 14), coal, 0, 4.6, 0);
      add(new THREE.CylinderGeometry(0.65, 0.65, 0.08, 14), coal, 0, 4.32, 0);
      break;
    }
    case 'snowball': {
      const snow = keep(mat(0xf2f7ff, { roughness: 0.95, flatShading: true }));
      add(new THREE.IcosahedronGeometry(2.3, 2), snow, 0, 0, 0);
      break;
    }
    case 'boulder': {
      const rock = keep(mat(def.lava ? 0x2a2226 : 0xb06a44, { roughness: 0.95, flatShading: true, emissive: def.lava ? 0xff4000 : 0x000000, emissiveIntensity: def.lava ? 0.35 : 0 }));
      add(new THREE.DodecahedronGeometry(2.5, 1), rock, 0, 0, 0);
      break;
    }
    case 'tumbleweed': {
      const twig = keep(new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 1, wireframe: true }));
      add(new THREE.IcosahedronGeometry(1.3, 1), twig, 0, 0, 0);
      add(new THREE.IcosahedronGeometry(1.0, 1).rotateY(0.6), twig, 0, 0, 0);
      break;
    }
    case 'stomper': {
      const face = keep(faceTexture('stomper'));
      const stone = keep(mat(0x7d7488, { roughness: 0.9 }));
      const faceMat = keep(new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 }));
      const box = add(new THREE.BoxGeometry(5.2, 3.6, 5.2), [stone, stone, stone, stone, faceMat, faceMat], 0, 1.8, 0);
      box.name = 'stomperBody';
      const spike = keep(mat(0x5a5264));
      for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) add(new THREE.ConeGeometry(0.45, 0.9, 6), spike, x, 3.9, z);
      // warning shadow disc on the road
      const sh = new THREE.Mesh(keep(new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2)),
        keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })));
      sh.name = 'shadow';
      g.userData.shadow = sh;
      break;
    }
    default: break;
  }
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
    for (const d of track?.hazardDefs || []) {
      const spec = SPEC[d.type];
      if (!spec) continue;
      const model = buildModel(d.type, d, this.disposables);
      this.group.add(model);
      const h = {
        def: d, type: d.type, spec, model,
        pos: new THREE.Vector3(), roll: 0, lastLat: 0,
        phase: d.phase || 0,   // deterministic so online guests see the same motion as the host
        broken: 0, cool: new Map(), state: 'up', y: 0,
        hazard: { position: new THREE.Vector3(), radius: spec.radius, type: d.type },
      };
      if (model.userData.shadow) this.group.add(model.userData.shadow);
      track.pointAt(d.t, d.lat || 0, h.pos);
      h.baseY = h.pos.y;
      h.heading = track.headingAt ? track.headingAt(d.t) : 0;
      model.rotation.y = d.type === 'stomper' ? h.heading + Math.PI : h.heading;
      this.items.push(h);
    }
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
    if (sp.period && h.type !== 'stomper') {
      const amp = d.amp || 8;
      const w = TAU / sp.period;
      const lat = (d.lat || 0) + amp * Math.sin(time * w + h.phase * 3);
      tr.pointAt(d.t, lat, h.pos);
      const dl = lat - h.lastLat; h.lastLat = lat;
      const r = sp.radius;
      if (h.type === 'crab') {
        h.pos.y += 0;
        h.model.position.copy(h.pos);
        h.model.position.y += Math.abs(Math.sin(time * 14)) * 0.12;
        h.model.rotation.z = Math.sin(time * 14) * 0.08;
      } else {
        const bounce = h.type === 'tumbleweed' ? Math.abs(Math.sin(time * 5 + h.phase)) * 1.6 : 0;
        h.pos.y += r + bounce;
        h.roll += dl / r;
        h.model.position.copy(h.pos);
        h.model.rotation.set(0, h.heading, 0);
        h.model.rotateZ(-h.roll);
        if (h.type === 'tumbleweed') h.model.rotateX(time * 3);
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
      h.model.position.set(h.pos.x, h.baseY + y, h.pos.z);
      const sh = h.model.userData.shadow;
      if (sh) {
        sh.position.set(h.pos.x, h.baseY + 0.05, h.pos.z);
        const k = 1 - Math.min(1, y / top);
        sh.material.opacity = 0.18 + 0.4 * k;
        sh.scale.setScalar(0.7 + 0.35 * k);
      }
      dangerY = y;
    } else {
      h.model.position.copy(h.pos);
    }

    // collisions
    if (this._collide === false) return;
    for (const k of this.karts) {
      if (!k || !k.position || k.fallTimer > 0 || k.respawnTimer > 0 || k.ghostTimer > 0) continue;
      const dx = k.position.x - h.pos.x, dz = k.position.z - h.pos.z;
      const kr = k.radius || 1.3;
      if (h.type === 'stomper') {
        const half = 2.6 + kr * 0.8;
        // footprint test in the block's local frame (square)
        const c = Math.cos(h.heading), s = Math.sin(h.heading);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) > half || Math.abs(lz) > half) continue;
        const bottom = h.baseY + dangerY;
        if (h.state === 'slam' && k.position.y < bottom + 1.5) {
          if (!h.cool.has(k)) { h.cool.set(k, 1.0); if (k.applyHit?.('squash') !== false) bus.emit('hazard:hit', { kart: k, type: h.type }); }
        } else if ((h.state === 'down' || (h.state === 'rise' && dangerY < 2)) && k.position.y < bottom + 3) {
          // solid block: push out along the smallest overlap axis
          const ox = half - Math.abs(lx), oz = half - Math.abs(lz);
          let px = 0, pz = 0;
          if (ox < oz) px = Math.sign(lx) * ox; else pz = Math.sign(lz) * oz;
          // back to world
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
